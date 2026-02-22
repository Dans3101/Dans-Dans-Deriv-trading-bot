// src/bot/DerivBot.js

import WebSocket from 'ws';
import { DERIV_WS, SETTINGS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';
import { createDigitMonitor, decideFromMonitor } from './digitStrategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

class AccumulatorBot {
  constructor(user, parentBot = null) {
    this.user = user;
    this.bot = parentBot;
    this.inTrade = false;
    this.currentContractId = null;
    this.lastTelegramSent = 0;
    this.telegramInterval = 2000;
    this.baseStake = 5;
    this.lastProfit = null;
    this.cooldown = false;
  }

  safeTelegram(message) {
    const now = Date.now();
    if (now - this.lastTelegramSent < this.telegramInterval) return;
    this.lastTelegramSent = now;
    try {
      const p = sendTelegramMessage(message);
      if (p?.catch) p.catch(err => console.warn('Telegram send failed (acc):', err?.message || err));
    } catch (err) {
      console.warn('Telegram send failed (acc):', err?.message || err);
    }
  }

  placeTrade() {
    if (!this.user.active || this.inTrade || !canTrade(this.user)) return;
    if (this.bot && (this.bot.pendingBuy || this.user.inTrade)) return;

    const limits = checkLimits(this.user);
    if (limits !== 'OK') return;

    let stake = this.baseStake;
    if (this.lastProfit > 0) stake = +(stake * 1.2).toFixed(2);

    const MIN_STAKE = Number(this.user.minStake) || 0.31;
    const MAX_STAKE = Number(this.user.maxStake) || 1.0;

    if (!stake || Number.isNaN(Number(stake))) stake = MIN_STAKE;
    stake = Math.round(Number(stake) * 100) / 100;
    if (stake < MIN_STAKE) stake = MIN_STAKE;
    if (stake > MAX_STAKE) stake = MAX_STAKE;

    const balance = Number(this.user.currentBalance || 0);
    if (balance < stake) return;

    this.inTrade = true;

    const payload = {
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: 'stake',
        contract_type: 'ACCU',
        currency: 'USD',
        duration: 1,
        duration_unit: 'm',
        symbol: this.user.market
      }
    };

    console.log(`[${this.user.userId}] SEND BUY (acc)`, JSON.stringify(payload));
    this.safeTelegram(`🚀 ${this.user.userId} | ACC | $${stake}`);

    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(payload));
    } else {
      this.inTrade = false;
    }
  }

  handleContractUpdate(contract) {
    if (!contract?.is_sold) return;

    const profit = Number(contract.profit);
    this.inTrade = false;
    this.currentContractId = null;
    this.lastProfit = profit;

    const result = profit >= 0 ? 'WIN' : 'LOSS';
    this.safeTelegram(`[ACC RESULT] ${this.user.userId} | ${result} | $${profit}`);

    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: 'ACCUMULATOR',
      stake: contract.buy_price || 0,
      profit,
      balance: this.user.currentBalance
    });
  }
}

export class DerivBot {
  constructor(user) {
    this.user = user;
    this.reconnectTimeout = null;
    this.pendingBuy = false;
    this.pendingBuyTimeout = null;
    this.PENDING_BUY_TIMEOUT_MS = 5000;
    this.tradeLoop = null;
    this.currentContractId = null;

    this.user.active = false;
    this.user.inTrade = false;
    this.user.currentBalance = 0;
    this.user.tradesToday = 0;

    this.accBot = new AccumulatorBot(this.user, this);

    this.digitMonitor = createDigitMonitor({ windowSize: 60 });

    if (!this.user.market) {
      this.user.market = 'R_100';
    }
  }

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] Connected`);
      this.authorize();
      this.startDigitLoop();
    });

    this.user.ws.on('message', msg => {
      try {
        this.handleMessage(JSON.parse(msg));
      } catch (e) {
        console.error(`[${this.user.userId}] JSON parse error`, e?.message);
      }
    });

    this.user.ws.on('close', () => {
      console.log(`[${this.user.userId}] Disconnected`);
      this.user.active = false;
      this.scheduleReconnect();
    });

    this.user.ws.on('error', err => {
      console.error(`[${this.user.userId}] WS error`, err?.message);
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      console.log(`[${this.user.userId}] Reconnecting...`);
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
    this.subscribeBalance();
  }

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        console.log(`[${this.user.userId}] Authorized`);
        break;

      case 'balance':
        this.handleBalance(data.balance?.balance);
        break;

      case 'tick':
        this.handleTick(data.tick);
        break;

      default:
        break;
    }
  }

  handleBalance(balance) {
    if (balance == null) return;
    this.user.currentBalance = balance;
    this.user.active = true;
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  handleTick(tick) {
    if (!tick?.quote) return;
    const direction = decideFromMonitor(this.digitMonitor);
    this.digitMonitor.add(tick.quote);

    if (!direction || this.user.inTrade || this.pendingBuy || !this.user.active || !canTrade(this.user)) return;

    const stake = +(this.user.currentBalance * 0.02).toFixed(2); // 2% of balance
    if (stake < 0.31) return;

    const payload = {
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: 'stake',
        contract_type: direction,
        currency: 'USD',
        duration: 1,
        duration_unit: 's',
        symbol: this.user.market
      }
    };

    this.pendingBuy = true;
    this.pendingBuyTimeout = setTimeout(() => this.pendingBuy = false, this.PENDING_BUY_TIMEOUT_MS);

    console.log(`[${this.user.userId}] SEND BUY (digit)`, JSON.stringify(payload));
    sendTelegramMessage(`[DIGIT STRAT] ${this.user.userId} | ${direction} | $${stake}`);
    this.send(payload);
  }

  startDigitLoop() {
    // Ensure tick updates continuously
    if (this.tradeLoop) return;
    this.tradeLoop = setInterval(() => {
      this.accBot.placeTrade();
    }, 180000 + Math.random() * 120000);
  }
}