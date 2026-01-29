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

    // ===== STATE =====
    this.candles = [];
    this.currentContractId = null;
    this.reconnectTimeout = null;

    this.user.active = false;
    this.user.inTrade = false;
    this.user.startBalance = 0;
    this.user.currentBalance = 0;
    this.user.maxBalance = 0;
    this.user.tradesToday = 0;
    this.user.lastTradeResult = null;
    this.user.martingaleStep = 0;
    this.user.baseStake = null;

    this.firstTradeDone = false;
    this.lastTelegramSent = 0;
    this.telegramInterval = 2000;

    // ===== MINI-CANDLE BUILDING =====
    this.tickBuffer = [];

    // ===== CONTINUOUS TRADING LOOP =====
    this.tradeLoop = null;

    // ===== TRADE RATE LIMITER =====
    this.tradeTimestamps = []; // timestamps of last trades
    this.MAX_TRADES_PER_MIN = 10;

    // ===== DEFAULT MARKET =====
    if (!this.user.market) {
      this.user.market = 'R_50';
      console.log(`[${this.user.userId}] Market set to default: ${this.user.market}`);
    }
  }

  /* ================= CONNECTION ================= */
  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] ✅ Connected`);
      this.authorize();
      this.startTradeLoop();
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
        this.handleBalance(data.balance?.balance);
        break;

      case 'history':
        this.candles = (data.history || []).map(h => ({
          open: h.open,
          close: h.close,
          high: h.high,
          low: h.low,
          epoch: h.epoch
        }));
        console.log(`[${this.user.userId}] 📊 History loaded: ${this.candles.length} candles`);
        break;

      case 'tick':
        this.handleTick(data.tick);
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
        console.log(`[${this.user.userId}] 📨 Unknown message type:`, data.msg_type);
        break;
    }
  }

  /* ================= MINI-CANDLE BUILDER ================= */
  handleTick(tick) {
    if (!tick?.quote || !tick?.epoch) return;

    this.tickBuffer.push(tick);

    const firstTick = this.tickBuffer[0];
    if (tick.epoch - firstTick.epoch >= 60) {
      const miniCandle = {
        open: firstTick.quote,
        close: tick.quote,
        high: Math.max(...this.tickBuffer.map(t => t.quote)),
        low: Math.min(...this.tickBuffer.map(t => t.quote)),
        epoch: tick.epoch
      };

      this.candles.push(miniCandle);
      if (this.candles.length > SETTINGS.CANDLE_COUNT) this.candles.shift();

      this.tickBuffer = [];

      console.log(`[${this.user.userId}] 📊 Mini-candle built: O:${miniCandle.open} H:${miniCandle.high} L:${miniCandle.low} C:${miniCandle.close}`);
    }
  }

  /* ================= BALANCE ================= */
  handleBalance(balance) {
    if (!balance) return;
    console.log(`[${this.user.userId}] 💰 Balance: ${balance}`);

    if (!this.user.startBalance) this.user.startBalance = balance;
    this.user.currentBalance = balance;
    if (balance > this.user.maxBalance) this.user.maxBalance = balance;
    this.user.active = true;
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  /* ================= CANDLES ================= */
  subscribeCandles() {
    if (!this.user.market) return console.error(`[${this.user.userId}] ❌ Market not set`);

    console.log(`[${this.user.userId}] 📡 Subscribing candles for market: ${this.user.market}`);

    this.send({
      ticks_history: this.user.market,
      style: 'candles',
      granularity: SETTINGS.CANDLE_GRANULARITY,
      count: SETTINGS.CANDLE_COUNT
    });

    this.send({
      ticks: this.user.market,
      subscribe: 1
    });
  }

  /* ================= CONTINUOUS TRADING LOOP ================= */
  startTradeLoop() {
    if (this.tradeLoop) return;
    this.tradeLoop = setInterval(() => {
      if (!this.user.inTrade && this.user.active && canTrade(this.user)) {
        this.tryTrade();
      }
    }, 1000);
  }

  /* ================= RATE-LIMIT CHECK ================= */
  canTradeNow() {
    const now = Date.now();

    // Remove timestamps older than 60 seconds
    this.tradeTimestamps = this.tradeTimestamps.filter(ts => now - ts < 60000);

    if (this.tradeTimestamps.length >= this.MAX_TRADES_PER_MIN) return false;

    this.tradeTimestamps.push(now);
    return true;
  }

  /* ================= TRADING LOGIC ================= */
  tryTrade(force = false) {
    if (!this.user.active || this.user.inTrade) return;
    if (!this.canTradeNow()) return; // rate-limiting

    const limits = checkLimits(this.user);
    if (limits !== 'OK') return;

    let direction = decideTradeDirection(this.candles);
    if (!direction && force && !this.firstTradeDone) {
      direction = 'CALL';
      console.log(`[DEBUG] 🔥 Forced first CALL trade`);
    }
    if (!direction) return;

    const stake = calculateStake(this.user);
    if (!stake || stake <= 0) return;

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
    if (!contract?.is_sold) return;

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
  }
}