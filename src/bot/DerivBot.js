import WebSocket from 'ws';
import { DERIV_WS, SETTINGS } from '../config/deriv.js';
import { checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';
import { createDigitMonitor, decideFromMonitor } from './digitStrategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

// Centralized bot registry for the Staff Portal
export const bots = new Map(); 

class AccumulatorBot {
  constructor(user, parentBot = null) {
    this.user = user;
    this.bot = parentBot;
    this.inTrade = false;
    this.currentContractId = null;
    this.lastTelegramSent = 0;
    this.telegramInterval = 2000;
  }

  safeTelegram(message) {
    const now = Date.now();
    if (now - this.lastTelegramSent < this.telegramInterval) return;
    this.lastTelegramSent = now;
    try {
      const p = sendTelegramMessage(message);
      if (p && typeof p.catch === 'function') p.catch(err => console.warn('Telegram failed (acc):', err?.message));
    } catch (err) {
      console.warn('Telegram failed (acc):', err?.message);
    }
  }

  placeTrade() {
    if (!this.user.active || this.inTrade || !canTrade(this.user)) return;
    if (this.bot && (this.bot.pendingBuy || this.user.inTrade)) return;

    const stake = Number(this.user.manualStake) || 0.35;
    const balance = Number(this.user.currentBalance || 0);
    if (balance < stake) return;

    this.inTrade = true;
    const payload = {
      buy: 1,
      price: stake,
      parameters: {
        amount: stake, basis: 'stake', contract_type: 'ACCU',
        currency: 'USD', duration: 1, duration_unit: 'm', symbol: this.user.market
      }
    };

    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(payload));
      this.safeTelegram(`🚀 ${this.user.userId} | Accumulator | $${stake}`);
    } else {
      this.inTrade = false;
    }
  }

  handleContractUpdate(contract) {
    if (!contract?.is_sold) return;
    this.inTrade = false;
    logTrade({
      userId: this.user.userId, market: this.user.market,
      direction: 'ACCUMULATOR', stake: contract.buy_price || 0,
      profit: Number(contract.profit), balance: this.user.currentBalance
    });
  }
}

export class DerivBot {
  constructor(user) {
    this.user = user;
    this.candles = [];
    this.user.active = false;
    this.user.inTrade = false;
    this.user.currentBalance = 0;
    this.user.tradesToday = 0;
    this.tickBuffer = [];
    this.tradeTimestamps = [];
    this.MAX_TRADES_PER_MIN = this.user.maxTradesPerMin || 10;
    this.accBot = new AccumulatorBot(this.user, this);
    this.digitMonitor = createDigitMonitor({ windowSize: 60 });
    this.pendingBuy = false;
    this.WS_PING_INTERVAL_MS = 15000;
    if (!this.user.market) this.user.market = 'R_100';
  }

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));
    this.user.ws.on('open', () => {
      this.send({ authorize: this.user.apiToken });
      setInterval(() => this.tryTrade(), 1000);
      setInterval(() => this.accBot.placeTrade(), 5 * 60 * 1000);
      this.wsPingInterval = setInterval(() => {
        if (this.user.ws?.readyState === WebSocket.OPEN) this.user.ws.ping();
      }, this.WS_PING_INTERVAL_MS);
    });
    this.user.ws.on('message', msg => this.handleMessage(JSON.parse(msg)));
    this.user.ws.on('close', () => {
      this.user.active = false;
      setTimeout(() => this.connect(), 5000);
    });
  }

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        this.send({ balance: 1, subscribe: 1 });
        this.send({ ticks: this.user.market, subscribe: 1 });
        break;
      case 'balance':
        if (!this.user.startBalance) this.user.startBalance = data.balance.balance;
        this.user.currentBalance = data.balance.balance;
        this.user.active = true;
        break;
      case 'tick':
        this.handleTick(data.tick);
        break;
      case 'buy':
        this.pendingBuy = false;
        if (data.buy?.contract_id) {
          this.user.inTrade = true;
          this.user.tradesToday++;
          this.send({ proposal_open_contract: 1, contract_id: data.buy.contract_id, subscribe: 1 });
        }
        break;
      case 'proposal_open_contract':
        const contract = data.proposal_open_contract;
        if (contract.contract_type === 'ACCU') this.accBot.handleContractUpdate(contract);
        else this.handleContractUpdate(contract);
        break;
    }
  }

  handleTick(tick) {
    if (!tick?.quote) return;
    this.digitMonitor.add(tick.quote);
    if (String(this.user.market).includes('100')) {
      const result = decideFromMonitor(this.digitMonitor);
      if (result && !this.user.inTrade && !this.pendingBuy && this.user.active && this.canTradeNow()) {
        const stake = Number(this.user.manualStake) || 0.35;
        if (this.user.currentBalance < stake) return;
        this.pendingBuy = true;
        this.send({
          buy: 1, price: stake,
          parameters: {
            amount: stake, basis: 'stake', contract_type: result,
            currency: 'USD', duration: 1, duration_unit: 's', symbol: this.user.market
          }
        });
      }
    }
  }

  handleContractUpdate(contract) {
    if (!contract?.is_sold) return;
    this.user.inTrade = false;
    this.digitMonitor.onResult(contract.profit >= 0 ? 'win' : 'loss');
    logTrade({
      userId: this.user.userId, market: this.user.market,
      direction: 'DIGIT', stake: contract.buy_price || 0,
      profit: Number(contract.profit), balance: this.user.currentBalance
    });
  }

  send(data) { if (this.user.ws?.readyState === WebSocket.OPEN) this.user.ws.send(JSON.stringify(data)); }
  canTradeNow() {
    const now = Date.now();
    this.tradeTimestamps = this.tradeTimestamps.filter(ts => now - ts < 60000);
    if (this.tradeTimestamps.length >= this.MAX_TRADES_PER_MIN) return false;
    this.tradeTimestamps.push(now);
    return true;
  }
}
