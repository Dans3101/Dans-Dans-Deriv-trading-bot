// src/bot/DerivBot.js

import WebSocket from 'ws';
import { DERIV_WS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { createDigitMonitor, decideFromMonitor } from './digitStrategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

class AccumulatorBot {
  constructor(user, parentBot = null) {
    this.user = user;
    this.bot = parentBot;
    this.inTrade = false;
    this.lastTelegramSent = 0;
    this.telegramInterval = 2000;
    this.baseStake = 5;
    this.lastProfit = null;
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

  placeTrade(direction, stake) {
    if (!this.user.active || this.inTrade || !canTrade(this.user)) return;

    const limits = checkLimits(this.user);
    if (limits !== 'OK') return;

    stake = stake || this.baseStake;
    const MIN_STAKE = Number(this.user.minStake) || 0.31;
    const MAX_STAKE = Number(this.user.maxStake) || 1.0;

    if (stake < MIN_STAKE) stake = MIN_STAKE;
    if (stake > MAX_STAKE) stake = MAX_STAKE;

    if ((Number(this.user.currentBalance) || 0) < stake) {
      console.warn(`[${this.user.userId}] ACC skipped: insufficient balance`);
      return;
    }

    this.inTrade = true;

    const payload = {
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: 'stake',
        contract_type: 'CALLPUT',
        currency: 'USD',
        duration: 1,
        duration_unit: 'm',
        symbol: this.user.market,
        prediction: direction
      }
    };

    console.log(`[${this.user.userId}] SEND BUY`, JSON.stringify(payload));
    this.safeTelegram(`🚀 ${this.user.userId} | ${direction} | $${stake}`);

    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(payload));
    } else {
      console.warn(`[${this.user.userId}] WS not open`);
      this.inTrade = false;
    }
  }

  handleContractUpdate(contract) {
    if (!contract?.is_sold) return;
    const profit = Number(contract.profit);
    this.inTrade = false;
    this.lastProfit = profit;

    const result = profit >= 0 ? 'WIN' : 'LOSS';
    console.log(`[ACC RESULT] ${result} | Profit: ${profit}`);
    this.safeTelegram(`[ACC RESULT] ${this.user.userId} | ${result} | ${profit}`);

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
    this.currentContractId = null;
    this.user.active = false;
    this.user.inTrade = false;
    this.user.currentBalance = 0;

    this.accBot = new AccumulatorBot(this.user, this);

    if (!this.user.market) this.user.market = 'R_100';
    console.log(`[${this.user.userId}] Market set: ${this.user.market}`);

    // Digit monitor for strategy
    this.digitMonitor = createDigitMonitor({ windowSize: 100 });
  }

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
    console.log(`[${this.user.userId}] Authorizing...`);
    this.send({ authorize: this.user.apiToken });
  }

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        console.log(`[${this.user.userId}] Authorized`);
        this.subscribeBalance();
        this.subscribeTicks();
        break;

      case 'balance':
        this.handleBalance(data.balance?.balance);
        break;

      case 'tick':
        this.handleTick(data.tick);
        break;

      case 'buy':
        console.log(`[${this.user.userId}] Buy accepted`);
        break;

      default:
        console.log(`[${this.user.userId}] RAW:`, JSON.stringify(data));
    }
  }

  handleBalance(balance) {
    if (balance == null) return;
    this.user.currentBalance = balance;
    this.user.active = true;
    console.log(`[${this.user.userId}] Balance: ${balance}`);
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  subscribeTicks() {
    if (!this.user.market) return;
    this.send({ ticks: this.user.market, subscribe: 1 });
    console.log(`[${this.user.userId}] Subscribed to ticks for ${this.user.market}`);
  }

  handleTick(tick) {
    if (!tick?.quote) return;

    // Add the latest digit
    const digit = this.digitMonitor.add(tick.quote);

    // Decide whether to trade
    const decision = decideFromMonitor(this.digitMonitor);
    if (decision) {
      this.accBot.placeTrade(decision, 0.5); // 0.5 USD stake for testing
    }
  }
}