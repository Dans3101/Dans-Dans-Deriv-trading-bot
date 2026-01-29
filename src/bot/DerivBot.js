// src/bot/DerivBot.js

import WebSocket from 'ws';
import { DERIV_WS, SETTINGS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

export class DerivBot {
  constructor(user) {
    this.user = user;

    // ===== USER STATE =====
    this.user.active = false;
    this.user.inTrade = false;
    this.user.startBalance = 0;
    this.user.currentBalance = 0;
    this.user.maxBalance = 0;
    this.user.tradesToday = 0;

    // ===== MARTINGALE STATE =====
    this.user.lastTradeResult = null;
    this.user.martingaleStep = 0;
    this.user.baseStake = null;

    // ===== FIRST TRADE FLAG =====
    this.firstTradeDone = false;

    // ===== TELEGRAM RATE LIMIT =====
    this.lastTelegramSent = 0;
    this.telegramInterval = 2000;

    // ===== OTHER STATE =====
    this.candles = [];
    this.currentContractId = null;
    this.reconnectTimeout = null;

    // ===== MARKET CHECK =====
    if (!this.user.market) {
      console.error(`[${this.user.userId}] ❌ Market not set in user object!`);
    } else {
      console.log(`[${this.user.userId}] Market set to: ${this.user.market}`);
    }
  }

  /* ================= CONNECTION ================= */
  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] ✅ Connected`);
      this.authorize();
    });

    this.user.ws.on('message', msg => {
      try {
        this.handleMessage(JSON.parse(msg));
      } catch (e) {
        console.error(`[${this.user.userId}] ❌ JSON parse error`, e.message);
      }
    });

    this.user.ws.on('close', () => {
      console.log(`[${this.user.userId}] ❌ Disconnected`);
      this.user.active = false;
      this.scheduleReconnect();
    });

    this.user.ws.on('error', err => {
      console.error(`[${this.user.userId}] ❌ WS error`, err.message);
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      console.log(`[${this.user.userId}] 🔁 Reconnecting...`);
      this.connect();
    }, 5000);
  }

  send(data) {
    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(data));
    } else {
      console.warn(`[${this.user.userId}] ⚠️ WS not open`);
    }
  }

  authorize() {
    console.log(`[${this.user.userId}] 🔐 Authorizing...`);
    this.send({ authorize: this.user.apiToken });
  }

  /* ================= TELEGRAM ================= */
  safeTelegram(message) {
    const now = Date.now();
    if (now - this.lastTelegramSent < this.telegramInterval) return;
    this.lastTelegramSent = now;
    sendTelegramMessage(message);
  }

  /* ================= MESSAGE HANDLER ================= */
  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        console.log(`[${this.user.userId}] ✅ Authorized`);
        this.subscribeBalance();
        this.subscribeCandles();
        break;

      case 'balance':
        this.handleBalance(data.balance.balance);
        break;

      case 'candles':
        console.log(`[${this.user.userId}] 📊 Candles received: ${data.candles?.length}`);
        this.candles = data.candles || [];
        this.tryTrade();
        break;

      case 'buy':
        console.log(`[${this.user.userId}] 📝 Buy accepted`);
        this.currentContractId = data.buy.contract_id;
        this.subscribeContract();
        break;

      case 'proposal_open_contract':
        this.handleContractUpdate(data.proposal_open_contract);
        break;

      default:
        console.log(`[${this.user.userId}] 📨 Unknown message type`, data.msg_type);
        break;
    }
  }

  /* ================= BALANCE ================= */
  handleBalance(balance) {
    console.log(`[${this.user.userId}] 💰 Balance: ${balance}`);

    if (!this.user.startBalance) {
      this.user.startBalance = balance;
      this.user.maxBalance = balance;
    }

    this.user.currentBalance = balance;
    if (balance > this.user.maxBalance) {
      this.user.maxBalance = balance;
    }

    this.user.active = true;

    // FORCE FIRST TRADE WHEN READY
    if (this.candles.length >= 10 && !this.firstTradeDone) {
      console.log(`[${this.user.userId}] 🔥 Force first trade`);
      this.tryTrade(true);
    }
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  /* ================= CANDLES ================= */
  subscribeCandles() {
    if (!this.user.market) {
      console.error(`[${this.user.userId}] ❌ Market not set, cannot subscribe candles`);
      return;
    }

    console.log(`[${this.user.userId}] 📡 Subscribing candles for market: ${this.user.market}`);

    this.send({
      ticks_history: this.user.market,
      style: 'candles',
      granularity: SETTINGS.CANDLE_GRANULARITY,
      count: SETTINGS.CANDLE_COUNT,
      subscribe: 1
    });

    // Re-fetch candles every 5 seconds
    setTimeout(() => this.subscribeCandles(), 5000);
  }

  /* ================= TRADING LOGIC ================= */
  tryTrade(force = false) {
    console.log(`[DEBUG] tryTrade → active: ${this.user.active}, inTrade: ${this.user.inTrade}, candles: ${this.candles.length}, force: ${force}`);

    if (!this.user.active) {
      console.log(`[DEBUG] ❌ User not active`);
      return;
    }

    if (this.user.inTrade) {
      console.log(`[DEBUG] ❌ Already in trade`);
      return;
    }

    if (!canTrade(this.user)) {
      console.log(`[DEBUG] ❌ Blocked by PaymentGuard`);
      return;
    }

    const limits = checkLimits(this.user);
    if (limits !== 'OK') {
      console.log(`[DEBUG] ❌ Limit hit: ${limits}`);
      return;
    }

    let direction = decideTradeDirection(this.candles);
    console.log(`[DEBUG] Strategy direction: ${direction}`);

    if (!direction && force) {
      direction = 'CALL';
      console.log(`[DEBUG] 🔥 Forced CALL trade`);
    }

    if (!direction) {
      console.log(`[DEBUG] ❌ No trade signal`);
      return;
    }

    const stake = calculateStake(this.user);
    console.log(`[DEBUG] Stake: ${stake}`);

    if (!stake || stake <= 0) {
      console.log(`[DEBUG] ❌ Invalid stake`);
      return;
    }

    this.user.inTrade = true;
    this.user.tradesToday++;
    this.firstTradeDone = true;

    console.log(`[TRADE] 🚀 ${direction} $${stake}`);

    this.safeTelegram(`🚀 ${this.user.userId} | ${direction} | $${stake}`);

    this.send({
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: 'stake',
        contract_type: direction,
        currency: 'USD',
        duration: 1,
        duration_unit: 'm',
        symbol: this.user.market
      }
    });
  }

  /* ================= CONTRACT ================= */
  subscribeContract() {
    if (!this.currentContractId) return;

    this.send({
      proposal_open_contract: 1,
      contract_id: this.currentContractId,
      subscribe: 1
    });
  }

  handleContractUpdate(contract) {
    if (!contract.is_sold) return;

    const profit = Number(contract.profit);
    this.user.inTrade = false;
    this.currentContractId = null;

    const result = profit >= 0 ? 'WIN' : 'LOSS';
    this.user.lastTradeResult = result;

    console.log(`[RESULT] ${result} | Profit: ${profit}`);

    this.safeTelegram(`[RESULT] ${this.user.userId} | ${result} | Profit: ${profit}`);

    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: result,
      stake: contract.buy_price || 0,
      profit,
      balance: this.user.currentBalance
    });

    // Continue trading after contract closes
    setTimeout(() => this.tryTrade(), 1000);
  }
}