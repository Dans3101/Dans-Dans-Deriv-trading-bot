// src/bot/DerivBot.js

import WebSocket from 'ws';
import { DERIV_WS, SETTINGS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';
import { createDigitMonitor, decideFromMonitor } from './digitStrategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

/**
 * Safe DerivBot - guards added:
 * - robust 'buy' handling (checks data.buy exists)
 * - validate stake against currentBalance before sending buys
 * - clear pendingBuy on malformed responses
 * - logs helpful debug messages
 */

/* ================= ACCUMULATOR BOT ================= */
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
      const res = sendTelegramMessage(message);
      if (res && typeof res.catch === 'function') res.catch(err => console.error('Telegram send failed (acc):', err?.message || err));
    } catch (err) {
      console.error('Telegram send failed (acc):', err?.message || err);
    }
  }

  placeTrade() {
    if (!this.user.active || this.inTrade || !canTrade(this.user)) return;
    if (this.bot && (this.bot.pendingBuy || this.user.inTrade)) return;

    const limits = checkLimits(this.user);
    if (limits !== 'OK') return;

    let stake = this.baseStake;
    if (this.lastProfit > 0) stake = +(stake * 1.2).toFixed(2);

    // Ensure user has enough balance
    const balance = Number(this.user.currentBalance || 0);
    if (balance < stake) {
      console.warn(`[${this.user.userId}] ACC placeTrade skipped: insufficient balance (${balance}) for stake ${stake}`);
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

    console.log(`[${this.user.userId}] SEND BUY (acc) payload:`, JSON.stringify(payload));
    this.safeTelegram(`🚀 ${this.user.userId} | Accumulator | $${stake}`);

    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(payload));
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
      setTimeout(() => (this.cooldown = false), 2 * 60 * 1000);
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

    this.tickBuffer = [];
    this.tradeLoop = null;

    this.tradeTimestamps = [];
    this.MAX_TRADES_PER_MIN = this.user.maxTradesPerMin || 30;

    this.accBot = new AccumulatorBot(this.user, this);

    this.digitMonitor = createDigitMonitor({ windowSize: 60 });

    this.pendingBuy = false;
    this.pendingBuyTimeout = null;
    this.PENDING_BUY_TIMEOUT_MS = 5000;

    this.wsPingInterval = null;
    this.WS_PING_INTERVAL_MS = 15000;

    if (!this.user.market) {
      this.user.market = 'R_100';
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
      this.startAccumulatorLoop();
      try {
        this.wsPingInterval = setInterval(() => {
          if (this.user.ws?.readyState === WebSocket.OPEN) {
            try {
              this.user.ws.ping();
            } catch (e) {}
          }
        }, this.WS_PING_INTERVAL_MS);
      } catch (e) {}
    });

    this.user.ws.on('message', (msg) => {
      try {
        this.handleMessage(JSON.parse(msg));
      } catch (e) {
        console.error(`[${this.user.userId}] ❌ JSON parse error`, e?.message || e);
      }
    });

    this.user.ws.on('close', () => {
      console.log(`[${this.user.userId}] ❌ Disconnected`);
      this.user.active = false;
      this._clearPendingBuy();
      this._clearPingInterval();
      this.scheduleReconnect();
    });

    this.user.ws.on('error', (err) => {
      console.error(`[${this.user.userId}] ❌ WS error`, err?.message || err);
      this._clearPendingBuy();
      this._clearPingInterval();
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
      if (res && typeof res.catch === 'function') res.catch((err) => console.error('Telegram send failed:', err?.message || err));
    } catch (err) {
      console.error('Telegram send failed:', err?.message || err);
    }
  }

  _clearPendingBuy() {
    this.pendingBuy = false;
    if (this.pendingBuyTimeout) {
      clearTimeout(this.pendingBuyTimeout);
      this.pendingBuyTimeout = null;
    }
  }

  _clearPingInterval() {
    if (this.wsPingInterval) {
      clearInterval(this.wsPingInterval);
      this.wsPingInterval = null;
    }
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
      case 'ticks_history':
      case 'candles': {
        const hist = data.history || data.ticks_history || data.candles || [];
        this.candles = (hist || []).map((h) => ({
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

      case 'buy': {
        // Defensive handling: data.buy might be undefined if server returned an error
        if (!data || !data.buy) {
          console.warn(`[${this.user.userId}] BUY_REPLY_MALFORMED or error:`, JSON.stringify(data));
          // Clear pending buy so bot can continue
          this._clearPendingBuy();
          break;
        }

        console.log(`[${this.user.userId}] 📝 Buy accepted:`, JSON.stringify(data.buy || {}));
        // clear pending-buy timeout and mark as inTrade only if contract_id present
        if (this.pendingBuyTimeout) {
          clearTimeout(this.pendingBuyTimeout);
          this.pendingBuyTimeout = null;
        }
        this.pendingBuy = false;

        // Some buys may not include contract_id immediately; guard access
        const contractId = data.buy.contract_id || null;
        if (contractId) {
          this.currentContractId = contractId;
          this.user.inTrade = true;
          this.subscribeContract();
        } else {
          console.warn(`[${this.user.userId}] Buy accepted but no contract_id returned`, JSON.stringify(data.buy));
        }
        break;
      }

      case 'proposal_open_contract': {
        console.log(`[${this.user.userId}] CONTRACT_MSG:`, JSON.stringify(data.proposal_open_contract));
        if (data.proposal_open_contract?.contract_type === 'ACCU') {
          this.accBot.handleContractUpdate(data.proposal_open_contract);
        } else {
          this.handleContractUpdate(data.proposal_open_contract);
        }
        break;
      }

      default:
        console.log(`[${this.user.userId}] MSG_RAW:`, JSON.stringify(data));
        break;
    }
  }

  /* ================= MINI-CANDLE BUILDING & DIGIT STRAT ================= */
  handleTick(tick) {
    if (!tick?.quote || !tick?.epoch) return;

    console.log(`[${this.user.userId}] TICK: quote=${tick.quote} epoch=${tick.epoch}`);

    const digit = this.digitMonitor.add(tick.quote);

    this.tickBuffer.push(tick);

    try {
      const strategyMode = this.user.strategyMode || 'OVER';
      const direction = decideFromMonitor(this.digitMonitor, {
        mode: strategyMode,
        windowCheckCount: this.user.digitWindowCheckCount || 2,
        lookbackForLow: this.user.digitLookback || 6,
        sixPercentThreshold: this.user.digitSixPct || 90
      });

      const isR100 = String(this.user.market || '').toUpperCase().includes('100');

      if (
        direction &&
        isR100 &&
        !this.user.inTrade &&
        !this.pendingBuy &&
        this.user.active &&
        canTrade(this.user) &&
        this.canTradeNow()
      ) {
        const limits = checkLimits(this.user);
        if (limits === 'OK') {
          const calcStake = calculateStake(this.user);
          console.log(`[${this.user.userId}] calculateStake =>`, calcStake);

          // Determine stake carefully and validate against balance
          const balance = Number(this.user.currentBalance || 0);
          let stake = null;
          if (calcStake && Number(calcStake) > 0) stake = Number(calcStake);
          else if (this.user.baseStake && Number(this.user.baseStake) > 0) stake = Number(this.user.baseStake);
          else stake = Math.max(0.2, +(balance * (Number(this.user.stakePercent) || 0.02)).toFixed(2));

          if (!stake || stake <= 0) {
            console.warn(`[${this.user.userId}] Aborting buy: computed invalid stake=${stake}`);
            return;
          }

          if (balance < stake) {
            console.warn(`[${this.user.userId}] Aborting buy: insufficient balance (${balance}) for stake ${stake}`);
            return;
          }

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
          this.pendingBuyTimeout = setTimeout(() => {
            console.warn(`[${this.user.userId}] ⚠️ pending 1s buy timed out`);
            this._clearPendingBuy();
          }, this.PENDING_BUY_TIMEOUT_MS);

          console.log(
            `[${this.user.userId}] SEND BUY (digit) payload:`,
            JSON.stringify(payload),
            'pendingBuy=',
            this.pendingBuy,
            'inTrade=',
            this.user.inTrade,
            'stake=',
            stake
          );
          this.safeTelegram(`[DIGIT STRAT] ${this.user.userId} | Attempting ${direction} | $${stake} (digit ${digit})`);

          this.send(payload);

          this.user.tradesToday++;
          this.firstTradeDone = true;
        }
      }
    } catch (e) {
      console.error(`[${this.user.userId}] ❌ Digit strategy error this._clearPendingBuy();
    }

    // Build mini-candle
    const firstTick = this.tickBuffer[0];
    if (!firstTick) return;

    if (tick.epoch - firstTick.epoch >= SETTINGS.CANDLE_GRANULARITY) {
      const quotes = this.tickBuffer.map((t) => t.quote).filter((q) => typeof q === 'number');
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

      console.log(
        `[${this.user.userId}] 📊 Mini-candle built: O:${miniCandle.open} H:${miniCandle.high} L:${miniCandle.low} C:${miniCandle.close}`
      );

      this.tryTrade();
    }
  }

  /* ================= BALANCE ================= */
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

  /* ================= CONTINUOUS TRADING LOOP ================= */
  startTradeLoop() {
    if (this.tradeLoop) return;

    this.tradeLoop = setInterval(() => {
      if (!this.user.inTrade && !this.pendingBuy && this.user.active && canTrade(this.user)) {
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
    this.tradeTimestamps = this.tradeTimestamps.filter((ts) => now - ts < 60000);
    if (this.tradeTimestamps.length >= this.MAX_TRADES_PER_MIN) return false;
    this.tradeTimestamps.push(now);
    return true;
  }

  tryTrade(force = false) {
    if (!this.user.active || this.user.inTrade || this.pendingBuy) return;
    if (!this.canTradeNow()) return;

    const limits = checkLimits(this.user);
    if (limits !== 'OK') return;

    let direction = decideTradeDirection(this.candles);
    if (!direction && force && !this.firstTradeDone) {
      direction = 'CALL';
      console.log(`[DEBUG] 🔥 Forced first CALL trade`);
    }
    if (!direction) return;

    const calcStake = calculateStake(this.user);
    console.log(`[${this.user.userId}] calculateStake =>`, calcStake);

    const balance = Number(this.user.currentBalance || 0);
    let stake = null;
    if (calcStake && Number(calcStake) > 0) stake = Number(calcStake);
    else if (this.user.baseStake && Number(this.user.baseStake) > 0) stake = Number(this.user.baseStake);
    else stake = Math.max(0.2, +(balance * (Number(this.user.stakePercent) || 0.02)).toFixed(2));

    if (!stake || stake <= 0) {
      console.warn(`[${this.user.userId}] Aborting buy: computed invalid stake=${stake}`);
      return;
    }

    if (balance < stake) {
      console.warn(`[${this.user.userId}] Aborting buy: insufficient balance (${balance}) for stake ${stake}`);
      return;
    }

    const payload = {
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
    };

    this.pendingBuy = true;
    this.pendingBuyTimeout = setTimeout(() => {
      console.warn(`[${this.user.userId}] ⚠️ pending buy timed out`);
      this._clearPendingBuy();
    }, this.PENDING_BUY_TIMEOUT_MS);

    console.log(
      `[${this.user.userId}] SEND BUY (candle) payload:`,
      JSON.stringify(payload),
      'pendingBuy=',
      this.pendingBuy,
      'inTrade=',
      this.user.inTrade,
      'stake=',
      stake
    );
    this.safeTelegram(`🔜 ${this.user.userId} | Attempting ${direction} | $${stake}`);

    this.send(payload);

    this.user.tradesToday++;
    this.firstTradeDone = true;
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
    console.log(`[${this.user.userId}] CONTRACT_UPDATE_FULL:`, JSON.stringify(contract));
    if (!contract?.is_sold) return;

    const profit = Number(contract.profit);
    this.user.inTrade = false;
    this.currentContractId = null;

    const result = profit >= 0 ? 'WIN' : 'LOSS';
    this.user.lastTradeResult = result;

    console.log(`[RESULT] ${result} | Profit: ${profit}`);
    this.safeTelegram(`[RESULT] ${this.user.userId} | ${result} | Profit: ${profit}`);

    // As an extra safety: if balance wasn't updated by 'balance' msg, update from contract if available
    if (!this.user.currentBalance && typeof contract.sale_balance !== 'undefined') {
      console.log(`[${this.user.userId}] Updating balance from contract.sale_balance: ${contract.sale_balance}`);
      this.user.currentBalance = Number(contract.sale_balance);
    }

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