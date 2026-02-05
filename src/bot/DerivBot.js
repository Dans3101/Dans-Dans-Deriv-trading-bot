// src/bot/DerivBot.js

import WebSocket from 'ws';
import { DERIV_WS, SETTINGS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';
import { createDigitMonitor, decideFromMonitor } from './digitStrategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

/* ================= ACCUMULATOR BOT ================= */
class AccumulatorBot {
  constructor(user) {
    this.user = user;
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
      const res = sendTelegramMessage(message);
      if (res && typeof res.catch === 'function') {
        res.catch(err => console.error('Telegram send failed (acc):', err && err.message ? err.message : err));
      }
    } catch (err) {
      console.error('Telegram send failed (acc):', err && err.message ? err.message : err);
    }
  }

  placeTrade() {
    if (!this.user.active || this.inTrade || !canTrade(this.user) || this.cooldown) return;

    const limits = checkLimits(this.user);
    if (limits !== 'OK') return;

    let stake = this.baseStake;
    if (this.lastProfit > 0) stake = +(stake * 1.2).toFixed(2);

    this.inTrade = true;

    console.log(`[ACC TRADE] 🚀 $${stake}`);
    this.safeTelegram(`🚀 ${this.user.userId} | Accumulator | $${stake}`);

    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify({
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
      }));
    } else {
      console.warn(`[${this.user.userId}] ⚠️ WS not open (acc placeTrade)`);
      this.inTrade = false;
    }
  }

  handleContractUpdate(contract) {
    if (!contract?.is_sold) return;

    const profit = Number(contract.profit);
    this.inTrade = false;
    this.currentContractId = null;

    if (profit < 0) {
      this.cooldown = true;
      setTimeout(() => this.cooldown = false, 2 * 60 * 1000);
    }

    this.lastProfit = profit;

    const result = profit >= 0 ? 'WIN' : 'LOSS';
    console.log(`[ACC RESULT] ${result} | Profit: ${profit}`);
    this.safeTelegram(`[ACC RESULT] ${this.user.userId} | ${result} | Profit: ${profit}`);

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

/* ================= DERIV BOT ================= */
export class DerivBot {
  constructor(user) {
    this.user = user;

    // state
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

    // mini-candle
    this.tickBuffer = [];

    // trading loop
    this.tradeLoop = null;

    // rate limiter
    this.tradeTimestamps = [];
    this.MAX_TRADES_PER_MIN = 10;

    // accumulator
    this.accBot = new AccumulatorBot(this.user);

    // digit strategy monitor (R_100 1s)
    this.digitMonitor = createDigitMonitor({ windowSize: 60 });

    // default market
    if (!this.user.market) {
      this.user.market = 'R_100';
      console.log(`[${this.user.userId}] Market set to default: ${this.user.market}`);
    }
  }

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] ✅ Connected`);
      this.authorize();
      this.startTradeLoop();
      this.startAccumulatorLoop();
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

  safeTelegram(message) {
    const now = Date.now();
    if (now - this.lastTelegramSent < this.telegramInterval) return;
    this.lastTelegramSent = now;

    try {
      const res = sendTelegramMessage(message);
      if (res && typeof res.catch === 'function') {
        res.catch(err => console.error('Telegram send failed:', err && err.message ? err.message : err));
      }
    } catch (err) {
      console.error('Telegram send failed:', err && err.message ? err.message : err);
    }
  }

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
      case 'ticks_history':
      case 'candles': {
        const hist = data.history || data.ticks_history || data.candles || [];
        this.candles = (hist || []).map(h => ({
          open: h.open,
          close: h.close,
          high: h.high,
          low: h.low,
          epoch: h.epoch
        }));
        console.log(`[${this.user.userId}] 📊 History loaded: ${this.candles.length} candles`);
        break;
      }

      case 'tick':
        this.handleTick(data.tick);
        break;

      case 'buy':
        console.log(`[${this.user.userId}] 📝 Buy accepted`);
        this.currentContractId = data.buy.contract_id;
        this.subscribeContract();
        break;

      case 'proposal_open_contract':
        if (data.proposal_open_contract?.contract_type === 'ACCU') {
          this.accBot.handleContractUpdate(data.proposal_open_contract);
        } else {
          this.handleContractUpdate(data.proposal_open_contract);
        }
        break;

      default:
        console.log(`[${this.user.userId}] 📨 Unknown message type:`, data.msg_type);
        break;
    }
  }

  handleTick(tick) {
    if (!tick?.quote || !tick?.epoch) return;

    // digit monitor (integer last digit)
    const digit = this.digitMonitor.add(tick.quote);

    this.tickBuffer.push(tick);

    // Digit-strategy decision (for R_100)
    try {
      const strategyMode = this.user.strategyMode || 'OVER';
      const direction = decideFromMonitor(this.digitMonitor, { mode: strategyMode });

      const isR100 = String(this.user.market || '').toUpperCase().includes('100');
      if (direction && isR100 && !this.user.inTrade && this.user.active && canTrade(this.user) && this.canTradeNow()) {
        const limits = checkLimits(this.user);
        if (limits === 'OK') {
          const stake = calculateStake(this.user) || (this.user.baseStake || 1);

          console.log(`[DIGIT STRAT] ${this.user.userId} → ${direction} (digit=${digit}) stake=${stake}`);
          this.safeTelegram(`[DIGIT STRAT] ${this.user.userId} | ${direction} | $${stake} (digit ${digit})`);

          this.send({
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
          });

          // Prevent concurrent trades until contract update arrives
          this.user.inTrade = true;
          this.user.tradesToday++;
          this.firstTradeDone = true;
        }
      }
    } catch (e) {
      console.error(`[${this.user.userId}] ❌ Digit strategy error`, e && e.message ? e.message : e);
    }

    // Build mini-candle based on configured granularity
    const firstTick = this.tickBuffer[0];
    if (!firstTick) return;

    if (tick.epoch - firstTick.epoch >= SETTINGS.CANDLE_GRANULARITY) {
      const quotes = this.tickBuffer.map(t => t.quote).filter(q => typeof q === 'number');
      const miniCandle = {
        open: firstTick.quote,
        close: tick.quote,
        high: quotes.length ? Math.max(...quotes) : firstTick.quote,
        low: quotes.length ? Math.min(...quotes) : firstTick.quote,
        epoch: tick.epoch
      };

      this.candles.push(miniCandle);
      if (this.candles.length > SETTINGS.CANDLE_COUNT) this.candles.shift();

      this.tickBuffer = [];

      console.log(`[${this.user.userId}] 📊 Mini-candle built: O:${miniCandle.open} H:${miniCandle.high} L:${miniCandle.low} C:${miniCandle.close}`);

      this.tryTrade();
    }
  }

  handleBalance(balance) {
    if (balance === undefined || balance === null) return;
    console.log(`[${this.user.userId}] 💰 Balance: ${balance}`);

    if (!this.user.startBalance) this.user.startBalance = balance;
    this.user.currentBalance = balance;
    if (balance > this.user.maxBalance) this.user.maxBalance = balance;
    this.user.active = true;
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

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

  startTradeLoop() {
    if (this.tradeLoop) return;

    this.tradeLoop = setInterval(() => {
      if (!this.user.inTrade && this.user.active && canTrade(this.user)) {
        this.tryTrade();
      }
    }, 1000);
  }

  startAccumulatorLoop() {
    setInterval(() => {
      if (this.user.active) this.accBot.placeTrade();
    }, 3 * 60 * 1000 + Math.random() * 2 * 60 * 1000);
  }

  canTradeNow() {
    const now = Date.now();
    this.tradeTimestamps = this.tradeTimestamps.filter(ts => now - ts < 60000);
    if (this.tradeTimestamps.length >= this.MAX_TRADES_PER_MIN) return false;
    this.tradeTimestamps.push(now);
    return true;
  }

  tryTrade(force = false) {
    if (!this.user.active || this.user.inTrade) return;
    if (!this.canTradeNow()) return;

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