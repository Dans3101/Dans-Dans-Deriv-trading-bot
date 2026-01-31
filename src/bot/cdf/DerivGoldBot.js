// src/bot/DerivGoldBot.js

import WebSocket from 'ws';
import { DERIV_WS } from '../config/deriv.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';

import {
  calculateGoldStake,
  canTradeGold,
  handleGoldTradeResult,
  shouldCloseGoldTrade,
  isMarketOpenGold
} from './goldRiskManager.js';

import { decideGoldTrade } from './goldStrategy.js';

/**
 * =========================
 * DERIV GOLD BOT (Gold/USD)
 * =========================
 * Independent commodity bot for Gold/USD
 * Runs continuously, closes profitable trades ≥ $1
 */

export class DerivGoldBot {
  constructor(user) {
    this.user = user;

    this.ws = null;
    this.candles = [];
    this.tickBuffer = [];
    this.currentContractId = null;
    this.inTrade = false;

    this.lastTelegramSent = 0;
    this.telegramInterval = 2000;

    this.symbol = 'GOLDUSD';
    this.tradeLoop = null;
  }

  /* ================= CONNECTION ================= */

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.ws = new WebSocket(DERIV_WS(appId));

    this.ws.on('open', () => {
      console.log('[GOLD] ✅ Connected');
      this.authorize();
    });

    this.ws.on('message', msg => {
      try {
        this.handleMessage(JSON.parse(msg));
      } catch (err) {
        console.error('[GOLD] ❌ JSON error', err.message);
      }
    });

    this.ws.on('close', () => {
      console.log('[GOLD] ❌ Disconnected — reconnecting...');
      setTimeout(() => this.connect(), 5000);
    });
  }

  authorize() {
    this.send({ authorize: this.user.apiToken });
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /* ================= TELEGRAM ================= */

  safeTelegram(msg) {
    const now = Date.now();
    if (now - this.lastTelegramSent < this.telegramInterval) return;
    this.lastTelegramSent = now;
    sendTelegramMessage(msg);
  }

  /* ================= MESSAGE HANDLER ================= */

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        console.log('[GOLD] 🔐 Authorized');
        this.subscribeBalance();
        this.subscribeCandles();
        this.startTradeLoop();
        break;

      case 'balance':
        this.user.currentBalance = data.balance.balance;
        break;

      case 'history':
        this.candles = data.history.map(c => ({
          open: c.open,
          close: c.close,
          high: c.high,
          low: c.low,
          epoch: c.epoch
        }));
        break;

      case 'tick':
        this.handleTick(data.tick);
        break;

      case 'buy':
        this.currentContractId = data.buy.contract_id;
        this.subscribeContract();
        break;

      case 'proposal_open_contract':
        this.handleContract(data.proposal_open_contract);
        break;
    }
  }

  /* ================= SUBSCRIPTIONS ================= */

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  subscribeCandles() {
    this.send({
      ticks_history: this.symbol,
      style: 'candles',
      granularity: 60,
      count: 50
    });

    this.send({ ticks: this.symbol, subscribe: 1 });
  }

  subscribeContract() {
    if (!this.currentContractId) return;
    this.send({
      proposal_open_contract: 1,
      contract_id: this.currentContractId,
      subscribe: 1
    });
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
      if (this.candles.length > 50) this.candles.shift();

      this.tickBuffer = [];

      console.log(`[GOLD] 📊 Mini-candle built: O:${miniCandle.open} H:${miniCandle.high} L:${miniCandle.low} C:${miniCandle.close}`);
    }
  }

  /* ================= TRADING LOOP ================= */

  startTradeLoop() {
    if (this.tradeLoop) return;

    this.tradeLoop = setInterval(() => {
      if (!isMarketOpenGold()) return; // systemic market check
      if (!canTrade(this.user)) return;
      if (!canTradeGold(this.user)) return;
      if (!this.inTrade) this.tryTrade();
    }, 5000); // every 5 seconds
  }

  tryTrade() {
    const direction = decideGoldTrade(this.candles);
    if (!direction) return;

    const stake = calculateGoldStake(this.user);
    if (!stake) return;

    this.inTrade = true;

    console.log(`[GOLD TRADE] 🚀 ${direction} $${stake}`);
    this.safeTelegram(`🥇 GOLD/USD | ${direction} | $${stake}`);

    this.send({
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: 'stake',
        contract_type: direction,
        currency: 'USD',
        duration: 5,
        duration_unit: 'm',
        symbol: this.symbol
      }
    });
  }

  /* ================= CONTRACT HANDLING ================= */

  handleContract(contract) {
    if (!contract) return;

    if (!contract.is_sold && shouldCloseGoldTrade(contract)) {
      this.send({ sell: contract.contract_id, price: 0 });
      return;
    }

    if (!contract.is_sold) return;

    const profit = Number(contract.profit);
    this.inTrade = false;
    this.currentContractId = null;

    handleGoldTradeResult(this.user, profit);

    const result = profit >= 0 ? 'WIN' : 'LOSS';
    console.log(`[GOLD RESULT] ${result} | Profit: ${profit}`);
    this.safeTelegram(`🥇 GOLD RESULT | ${result} | $${profit}`);

    setTimeout(() => this.tryTrade(), 3000);
  }
}