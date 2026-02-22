// src/bot/DerivBot.js

import WebSocket from 'ws';
import { DERIV_WS, SETTINGS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';
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
      if (p?.catch) {
        p.catch(err =>
          console.warn('Telegram send failed (acc):', err?.message || err)
        );
      }
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
    if (balance < stake) {
      console.warn(
        `[${this.user.userId}] ACC skipped: insufficient balance (${balance})`
      );
      return;
    }

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

    console.log(
      `[${this.user.userId}] SEND BUY (acc)`,
      JSON.stringify(payload)
    );

    this.safeTelegram(
      `🚀 ${this.user.userId} | ACC | $${stake}`
    );

    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(payload));
    } else {
      console.warn(`[${this.user.userId}] WS not open (acc)`);
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

    console.log(`[ACC RESULT] ${result} | Profit: ${profit}`);

    this.safeTelegram(
      `[ACC RESULT] ${this.user.userId} | ${result} | ${profit}`
    );

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

    if (!this.user.market) {
      this.user.market = 'R_100';
      console.log(
        `[${this.user.userId}] Default market set: ${this.user.market}`
      );
    }
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
        console.error(
          `[${this.user.userId}] JSON parse error`,
          e?.message
        );
      }
    });

    this.user.ws.on('close', () => {
      console.log(`[${this.user.userId}] Disconnected`);
      this.user.active = false;
      this.scheduleReconnect();
    });

    this.user.ws.on('error', err => {
      console.error(
        `[${this.user.userId}] WS error`,
        err?.message
      );
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
    } else {
      console.warn(`[${this.user.userId}] WS not open`);
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
        break;

      case 'balance':
        this.handleBalance(data.balance?.balance);
        break;

      case 'buy':
        console.log(`[${this.user.userId}] Buy accepted`);
        break;

      default:
        console.log(
          `[${this.user.userId}] RAW:`,
          JSON.stringify(data)
        );
    }
  }

  handleBalance(balance) {
    if (balance == null) return;

    console.log(`[${this.user.userId}] Balance: ${balance}`);
    this.user.currentBalance = balance;
    this.user.active = true;
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }
}