import WebSocket from 'ws';
import { DERIV_WS, SETTINGS } from '../config/deriv.js';
// checkLimits and riskManager imports kept for session safety, 
// but calculateStake logic is bypassed for manual entry.
import { checkLimits } from './riskManager.js';
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
    this.lastProfit = null;
    this.cooldown = false;
  }

  safeTelegram(message) {
    const now = Date.now();
    if (now - this.lastTelegramSent < this.telegramInterval) return;
    this.lastTelegramSent = now;
    try {
      const p = sendTelegramMessage(message);
      if (p && typeof p.catch === 'function') p.catch(err => console.warn('Telegram send failed (acc):', err?.message || err));
    } catch (err) {
      console.warn('Telegram send failed (acc):', err?.message || err);
    }
  }

  placeTrade() {
    if (!this.user.active || this.inTrade || !canTrade(this.user)) return;
    if (this.bot && (this.bot.pendingBuy || this.user.inTrade)) return;

    const limits = checkLimits(this.user);
    if (limits !== 'OK') return;

    // Use User-defined manual stake for Accumulator
    let stake = Number(this.user.manualStake) || 0.35;

    const balance = Number(this.user.currentBalance || 0);
    if (balance < stake) {
      console.warn(`[${this.user.userId}] ACC skipped: Insufficient balance ($${balance}) for stake $${stake}`);
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
    this.currentContractId = null;
    this.lastProfit = Number(contract.profit);
    const result = this.lastProfit >= 0 ? 'WIN' : 'LOSS';
    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: 'ACCUMULATOR',
      stake: contract.buy_price || 0,
      profit: this.lastProfit,
      balance: this.user.currentBalance
    });
  }
}

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
    this.user.tradesToday = 0;
    this.tickBuffer = [];
    this.tradeTimestamps = [];
    this.MAX_TRADES_PER_MIN = this.user.maxTradesPerMin || 10;
    this.accBot = new AccumulatorBot(this.user, this);
    this.digitMonitor = createDigitMonitor({ windowSize: 60 });
    this.pendingBuy = false;
    this.pendingBuyTimeout = null;
    this.PENDING_BUY_TIMEOUT_MS = 5000;
    this.wsPingInterval = null;
    this.WS_PING_INTERVAL_MS = 15000;

    if (!this.user.market) this.user.market = 'R_100';
  }

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));
    this.user.ws.on('open', () => {
      this.authorize();
      this.startTradeLoop();
      this.startAccumulatorLoop();
      this.wsPingInterval = setInterval(() => {
        if (this.user.ws?.readyState === WebSocket.OPEN) this.user.ws.ping();
      }, this.WS_PING_INTERVAL_MS);
    });
    this.user.ws.on('message', msg => this.handleMessage(JSON.parse(msg)));
    this.user.ws.on('close', () => {
      this.user.active = false;
      this._clearPendingBuy();
      this._clearPingInterval();
      this.scheduleReconnect();
    });
  }

  authorize() {
    this.send({ authorize: this.user.apiToken });
  }

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        this.subscribeBalance();
        this.subscribeCandles();
        break;
      case 'balance':
        this.handleBalance(data.balance?.balance);
        break;
      case 'tick':
        this.handleTick(data.tick);
        break;
      case 'buy':
        this._clearPendingBuy();
        if (data.buy?.contract_id) {
          this.currentContractId = data.buy.contract_id;
          this.user.inTrade = true;
          this.subscribeContract();
          this.user.tradesToday++;
        }
        break;
      case 'proposal_open_contract':
        if (data.proposal_open_contract?.contract_type === 'ACCU') {
          this.accBot.handleContractUpdate(data.proposal_open_contract);
        } else {
          this.handleContractUpdate(data.proposal_open_contract);
        }
        break;
    }
  }

  handleTick(tick) {
    if (!tick?.quote) return;
    const digit = this.digitMonitor.add(tick.quote);
    this.tickBuffer.push(tick);

    const isR100 = String(this.user.market || '').toUpperCase().includes('100');
    if (isR100) {
      const direction = decideFromMonitor(this.digitMonitor, { mode: this.user.strategyMode || 'OVER' });
      
      if (direction && !this.user.inTrade && !this.pendingBuy && this.user.active && this.canTradeNow()) {
        const balance = Number(this.user.currentBalance || 0);
        // GET USER MANUAL STAKE
        const stake = Number(this.user.manualStake) || 0.35;

        if (balance < stake) {
          console.warn(`[${this.user.userId}] Digit trade skipped: Balance too low for manual stake $${stake}`);
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
        this.send(payload);
        this.safeTelegram(`🎯 Digit Strat | ${this.user.userId} | ${direction} | $${stake}`);
      }
    }
  }

  tryTrade(force = false) {
    if (String(this.user.market).includes('100')) return;
    if (!this.user.active || this.user.inTrade || this.pendingBuy) return;

    let direction = decideTradeDirection(this.candles);
    if (direction) {
      const balance = Number(this.user.currentBalance || 0);
      // GET USER MANUAL STAKE
      const stake = Number(this.user.manualStake) || 0.35;

      if (balance < stake) return;

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
      this.send(payload);
    }
  }

  /* --- UTILITIES --- */
  handleBalance(balance) {
    if (!this.user.startBalance) this.user.startBalance = balance;
    this.user.currentBalance = balance;
    this.user.active = true;
  }

  send(data) {
    if (this.user.ws?.readyState === WebSocket.OPEN) this.user.ws.send(JSON.stringify(data));
  }

  subscribeBalance() { this.send({ balance: 1, subscribe: 1 }); }
  subscribeCandles() {
    this.send({ ticks: this.user.market, subscribe: 1 });
  }
  subscribeContract() {
    this.send({ proposal_open_contract: 1, contract_id: this.currentContractId, subscribe: 1 });
  }

  startTradeLoop() {
    setInterval(() => this.tryTrade(), 1000);
  }
  startAccumulatorLoop() {
    setInterval(() => this.accBot.placeTrade(), 5 * 60 * 1000);
  }

  canTradeNow() {
    const now = Date.now();
    this.tradeTimestamps = this.tradeTimestamps.filter(ts => now - ts < 60000);
    if (this.tradeTimestamps.length >= this.MAX_TRADES_PER_MIN) return false;
    this.tradeTimestamps.push(now);
    return true;
  }

  _clearPendingBuy() {
    this.pendingBuy = false;
    if (this.pendingBuyTimeout) clearTimeout(this.pendingBuyTimeout);
  }

  _clearPingInterval() { if (this.wsPingInterval) clearInterval(this.wsPingInterval); }

  handleContractUpdate(contract) {
    if (!contract?.is_sold) return;
    this.user.inTrade = false;
    this.currentContractId = null;
    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: contract.profit >= 0 ? 'WIN' : 'LOSS',
      stake: contract.buy_price || 0,
      profit: contract.profit,
      balance: this.user.currentBalance
    });
  }
}
