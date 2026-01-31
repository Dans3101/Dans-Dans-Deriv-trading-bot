// src/bot/DerivGoldBot.js

import WebSocket from 'ws';
import { DERIV_WS } from '../config/deriv.js';
import { decideGoldTrade } from './goldStrategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';

/**
 * DERIV GOLD/USD CFD BOT
 * Market: GOLDUSD (Deriv commodities)
 */

export class DerivGoldBot {
  constructor(user) {
    this.user = user;

    this.ws = null;
    this.candles = [];
    this.inTrade = false;
    this.contractId = null;

    this.lastTelegramSent = 0;
    this.telegramInterval = 3000;

    // ===== CONFIG =====
    this.MARKET = 'GOLDUSD';
    this.GRANULARITY = 60; // 1 minute candles
    this.CANDLE_COUNT = 50;

    this.STAKE = 5;        // Trade size
    this.TAKE_PROFIT = 1; // $1 profit target
  }

  /* ================= CONNECTION ================= */

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.ws = new WebSocket(DERIV_WS(appId));

    this.ws.on('open', () => {
      console.log(`[GOLD] ✅ Connected`);
      this.authorize();
    });

    this.ws.on('message', msg => {
      try {
        this.handleMessage(JSON.parse(msg));
      } catch (e) {
        console.error('[GOLD] ❌ JSON error', e.message);
      }
    });

    this.ws.on('close', () => {
      console.log('[GOLD] ❌ Disconnected');
      setTimeout(() => this.connect(), 5000);
    });
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  authorize() {
    this.send({ authorize: this.user.apiToken });
  }

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
        this.subscribeCandles();
        break;

      case 'history':
        this.candles = data.history.map(c => ({
          open: Number(c.open),
          close: Number(c.close),
          high: Number(c.high),
          low: Number(c.low),
          epoch: c.epoch
        }));
        console.log(`[GOLD] 📊 Loaded ${this.candles.length} candles`);
        break;

      case 'ohlc':
        this.handleCandle(data.ohlc);
        break;

      case 'buy':
        this.contractId = data.buy.contract_id;
        this.subscribeContract();
        break;

      case 'proposal_open_contract':
        this.handleContractUpdate(data.proposal_open_contract);
        break;
    }
  }

  /* ================= CANDLES ================= */

  subscribeCandles() {
    this.send({
      ticks_history: this.MARKET,
      style: 'candles',
      granularity: this.GRANULARITY,
      count: this.CANDLE_COUNT,
      subscribe: 1
    });
  }

  handleCandle(candle) {
    this.candles.push({
      open: Number(candle.open),
      close: Number(candle.close),
      high: Number(candle.high),
      low: Number(candle.low),
      epoch: candle.epoch
    });

    if (this.candles.length > this.CANDLE_COUNT) {
      this.candles.shift();
    }

    this.tryTrade();
  }

  /* ================= TRADING ================= */

  tryTrade() {
    if (this.inTrade) return;
    if (this.candles.length < 20) return;

    const signal = decideGoldTrade(this.candles);
    if (!signal) return;

    console.log(`[GOLD TRADE] 🚀 ${signal}`);
    this.safeTelegram(`🟡 GOLD/USD ${signal}`);

    this.inTrade = true;

    this.send({
      buy: 1,
      price: this.STAKE,
      parameters: {
        amount: this.STAKE,
        basis: 'stake',
        contract_type: signal === 'BUY' ? 'BUY' : 'SELL',
        currency: 'USD',
        symbol: this.MARKET
      }
    });
  }

  /* ================= CONTRACT ================= */

  subscribeContract() {
    if (!this.contractId) return;

    this.send({
      proposal_open_contract: 1,
      contract_id: this.contractId,
      subscribe: 1
    });
  }

  handleContractUpdate(contract) {
    if (!contract) return;

    const profit = Number(contract.profit || 0);

    // ===== TAKE PROFIT =====
    if (!contract.is_sold && profit >= this.TAKE_PROFIT) {
      this.send({ sell: contract.contract_id, price: 0 });
      return;
    }

    if (!contract.is_sold) return;

    this.inTrade = false;
    this.contractId = null;

    const result = profit >= 0 ? 'WIN' : 'LOSS';

    console.log(`[GOLD RESULT] ${result} | ${profit}`);
    this.safeTelegram(`🟡 GOLD ${result} | $${profit}`);
  }
}