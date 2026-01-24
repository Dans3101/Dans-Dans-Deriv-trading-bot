// src/bot/DerivBot.js

import WebSocket from 'ws';
import { DERIV_WS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

export class DerivBot {
  constructor(user) {
    this.user = user;

    this.candles = [];
    this.currentContractId = null;
    this.reconnectTimeout = null;

    // ===== USER STATE =====
    this.user.active = false;
    this.user.inTrade = false;
    this.user.startBalance = 0;
    this.user.currentBalance = 0;
    this.user.maxBalance = 0;
    this.user.tradesToday = 0;

    // ===== FORCE FIRST TRADE =====
    this.firstTradeDone = false;

    // ===== TELEGRAM RATE LIMIT =====
    this.lastTelegramSent = 0;
    this.telegramInterval = 2000;
  }

  /* ================= CONNECTION ================= */

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] Connected`);
      this.authorize();
    });

    this.user.ws.on('message', msg => {
      try {
        this.handleMessage(JSON.parse(msg));
      } catch (e) {
        console.error(`[${this.user.userId}] Parse error`, e.message);
      }
    });

    this.user.ws.on('close', () => {
      console.log(`[${this.user.userId}] Disconnected`);
      this.user.active = false;
      this.scheduleReconnect();
    });

    this.user.ws.on('error', err => {
      console.error(`[${this.user.userId}] WS error`, err.message);
      this.user.ws.close();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 5000);
  }

  send(data) {
    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(data));
    }
  }

  authorize() {
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
        console.log(`[${this.user.userId}] Authorized`);
        this.subscribeBalance();
        this.subscribeCandles();
        break;

      case 'balance':
        this.handleBalance(data.balance.balance);
        break;

     case 'candles':
       console.log(
       `[${this.user.userId}] Candles received:`,
        data.candles?.length
        );
        this.candles = data.candles;
        this.tryTrade();
        break;

      case 'candles':
        this.candles = data.candles;
        this.tryTrade();
        break;

      case 'buy':
        this.currentContractId = data.buy.contract_id;
        this.subscribeContract();
        break;

      case 'proposal_open_contract':
        this.handleContractUpdate(data.proposal_open_contract);
        break;
    }
  }

  /* ================= BALANCE ================= */

  handleBalance(balance) {
    if (!this.user.startBalance) {
      this.user.startBalance = balance;
      this.user.maxBalance = balance;
    }

    this.user.currentBalance = balance;
    if (balance > this.user.maxBalance) {
      this.user.maxBalance = balance;
    }

    this.user.active = true;

    // 🔥 FORCE FIRST TRADE WHEN READY
    if (this.candles.length >= 10 && !this.firstTradeDone) {
      this.tryTrade(true);
    }
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  /* ================= CANDLES ================= */

  subscribeCandles() {
    this.send({
      ticks_history: this.user.market,
      style: 'candles',
      granularity: 60,
      count: 30,
      subscribe: 1
    });
  }

  /* ================= TRADING LOGIC ================= */

  tryTrade(force = false) {
    if (!this.user.active || this.user.inTrade) return;

    if (!canTrade(this.user)) return;

    const status = checkLimits(this.user);
    if (status !== 'OK') return;

    let direction = decideTradeDirection(this.candles);

    // 🔥 FORCE FIRST TRADE DIRECTION
    if (!direction && force) {
      direction = 'CALL';
      console.log(`[${this.user.userId}] Forced first trade`);
    }

    if (!direction) return;

    const stake = calculateStake(this.user.currentBalance);
    if (!stake || stake <= 0) return;

    this.user.inTrade = true;
    this.user.tradesToday++;
    this.firstTradeDone = true;

    console.log(
      `[${this.user.userId}] TRADE → ${direction} $${stake.toFixed(2)}`
    );

    this.safeTelegram(
      `🚀 ${this.user.userId}\n${direction} | $${stake.toFixed(2)}`
    );

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

    console.log(
      `[${this.user.userId}] ${result} | ${profit.toFixed(2)}`
    );

    this.safeTelegram(
      `📊 ${this.user.userId}\n${result} | ${profit.toFixed(2)}`
    );

    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: result,
      stake: contract.buy_price || 0,
      profit,
      balance: this.user.currentBalance
    });

    // 🔁 CONTINUE TRADING
    setTimeout(() => this.tryTrade(), 1000);
  }
}