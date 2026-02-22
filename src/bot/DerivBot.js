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
    this.baseStake = 0.5; // Adjusted to match your test stake
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

  placeTrade(prediction, stake) {
    // 1. Validation Guards
    if (!this.user.active || this.inTrade || !canTrade(this.user)) return;

    const limits = checkLimits(this.user);
    if (limits !== 'OK') return;

    // 2. Stake Management
    stake = stake || this.baseStake;
    const MIN_STAKE = Number(this.user.minStake) || 0.35;
    const MAX_STAKE = Number(this.user.maxStake) || 5.0;

    if (stake < MIN_STAKE) stake = MIN_STAKE;
    if (stake > MAX_STAKE) stake = MAX_STAKE;

    if ((Number(this.user.currentBalance) || 0) < stake) {
      console.warn(`[${this.user.userId}] Insufficient balance: ${this.user.currentBalance}`);
      return;
    }

    this.inTrade = true;

    // 3. Construct Payload for Digits
    // Note: 'barrier' is used for the digit prediction in DIGITDIFF/DIGITMATCH
    const payload = {
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: 'stake',
        contract_type: 'DIGITDIFF', 
        currency: 'USD',
        duration: 1,
        duration_unit: 't', // 't' for Ticks is required for digits
        symbol: this.user.market || 'R_100',
        barrier: String(prediction) 
      }
    };

    console.log(`[${this.user.userId}] ATTEMPTING TRADE: Predict ${prediction} | Stake ${stake}`);
    
    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(payload));
    } else {
      console.warn(`[${this.user.userId}] WS closed, cannot trade`);
      this.inTrade = false;
    }
  }

  handleContractUpdate(contract) {
    if (!contract?.is_sold) return;
    const profit = Number(contract.profit);
    this.inTrade = false;
    this.lastProfit = profit;

    const result = profit >= 0 ? 'WIN' : 'LOSS';
    console.log(`[TRADE RESULT] ${result} | Profit: ${profit}`);
    this.safeTelegram(`🔔 ${this.user.userId} | ${result} | Profit: $${profit}`);

    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: 'DIGITDIFF',
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
    this.user.active = false;
    this.user.currentBalance = 0;

    this.accBot = new AccumulatorBot(this.user, this);

    if (!this.user.market) this.user.market = 'R_100';
    
    // Digit monitor for strategy
    this.digitMonitor = createDigitMonitor({ windowSize: 100 });
  }

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] Connected to Deriv`);
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
      console.log(`[${this.user.userId}] Connection Closed`);
      this.user.active = false;
      this.scheduleReconnect();
    });

    this.user.ws.on('error', err => {
      console.error(`[${this.user.userId}] WS Error`, err?.message);
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

  handleMessage(data) {
    // Handle API Errors first
    if (data.error) {
      console.error(`[${this.user.userId}] API ERROR:`, data.error.message);
      if (data.msg_type === 'buy') this.accBot.inTrade = false;
      return;
    }

    switch (data.msg_type) {
      case 'authorize':
        console.log(`[${this.user.userId}] Authorized Successfully`);
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
        console.log(`[${this.user.userId}] Buy Success: ${data.buy.contract_id}`);
        // Telegram notification of successful entry
        this.accBot.safeTelegram(`🚀 Trade Placed: ${data.buy.contract_id}`);
        break;

      case 'proposal_open_contract':
        this.accBot.handleContractUpdate(data.proposal_open_contract);
        break;

      default:
        // Optional: console.log(`[${this.user.userId}] Other msg:`, data.msg_type);
    }
  }

  handleBalance(balance) {
    if (balance == null) return;
    this.user.currentBalance = balance;
    this.user.active = true;
    console.log(`[${this.user.userId}] Balance Updated: ${balance}`);
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  subscribeTicks() {
    this.send({ ticks: this.user.market, subscribe: 1 });
    console.log(`[${this.user.userId}] Monitoring ${this.user.market}...`);
  }

  handleTick(tick) {
    if (!tick?.quote) return;

    // Add the latest digit via our monitor
    const digit = this.digitMonitor.add(tick.quote);

    // Get strategy decision (will return a digit 0-9 or null)
    const prediction = decideFromMonitor(this.digitMonitor);
    
    if (prediction !== null) {
      this.accBot.placeTrade(prediction, this.user.minStake || 0.5);
    }
  }
}
