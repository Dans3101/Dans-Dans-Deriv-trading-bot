// src/bot/DerivBot.js

import WebSocket from 'ws';
import { DERIV_WS, SETTINGS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { createDigitMonitor, decideFromMonitor } from './digitStrategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

export class DerivBot {
  constructor(user) {
    this.user = user;

    /* ================= SAFE DEFAULTS ================= */
    this.user.active = false;
    this.user.inTrade = false;

    this.currentContractId = null;
    this.tradeTimestamps = [];

    /* ===== PROTECTION SETTINGS ===== */
    this.MAX_TRADES_PER_MIN = 6;           // slower trading
    this.DIGIT_COOLDOWN_MS = 5000;        // 5 sec between trades
    this.MAX_LOSS_STREAK = 4;             // pause after 4 losses
    this.MAX_STAKE = 2;                  // never exceed $2
    this.DAILY_STOP_PCT = 0.10;           // stop at -10%

    /* ===== STATE ===== */
    this.lastDigitTradeTime = 0;
    this.lossStreak = 0;
    this.pendingBuy = false;
    this.pendingBuyTimeout = null;

    this.startBalance = 0;
    this.currentBalance = 0;

    /* ===== DIGIT STRATEGY ===== */
    this.digitMonitor = createDigitMonitor({ windowSize: 60 });

    if (!this.user.market) {
      this.user.market = 'R_100';
    }
  }

  /* ================= CONNECTION ================= */

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log("✅ Connected");
      this.authorize();
    });

    this.user.ws.on('message', msg => {
      this.handleMessage(JSON.parse(msg));
    });

    this.user.ws.on('close', () => {
      console.log("❌ Disconnected → reconnecting...");
      setTimeout(() => this.connect(), 4000);
    });
  }

  send(data) {
    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(data));
    }
  }

  authorize() {
    this.send({ authorize: this.user.apiToken });
  }

  /* ================= MESSAGE HANDLER ================= */

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        this.subscribeBalance();
        this.subscribeTicks();
        break;

      case 'balance':
        this.handleBalance(data.balance.balance);
        break;

      case 'tick':
        this.handleTick(data.tick);
        break;

      case 'buy':
        this.pendingBuy = false;
        this.user.inTrade = true;
        this.currentContractId = data.buy.contract_id;
        this.subscribeContract();
        break;

      case 'proposal_open_contract':
        this.handleContractUpdate(data.proposal_open_contract);
        break;
    }
  }

  /* ================= BALANCE ================= */

  handleBalance(balance) {
    if (!this.startBalance) this.startBalance = balance;
    this.currentBalance = balance;
    this.user.active = true;
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  subscribeTicks() {
    this.send({ ticks: this.user.market, subscribe: 1 });
  }

  /* ================= TICK / DIGIT LOGIC ================= */

  handleTick(tick) {
    if (!tick?.quote) return;

    const digit = this.digitMonitor.add(tick.quote);

    const direction = decideFromMonitor(this.digitMonitor, {
      mode: this.user.strategyMode || 'OVER',
      windowCheckCount: 3,
      lookbackForLow: 6,
      sixPercentThreshold: 60
    });

    const now = Date.now();

    if (
      direction &&
      !this.user.inTrade &&
      !this.pendingBuy &&
      this.user.active &&
      canTrade(this.user) &&
      this.canTradeNow() &&
      now - this.lastDigitTradeTime > this.DIGIT_COOLDOWN_MS &&
      this.lossStreak < this.MAX_LOSS_STREAK &&
      this.checkDailyStop()
    ) {
      this.placeTrade(direction, digit);
      this.lastDigitTradeTime = now;
    }
  }

  /* ================= TRADE ================= */

  placeTrade(direction, digit) {
    const stakeRaw = calculateStake(this.user) || 0.5;
    const stake = Math.min(stakeRaw, this.MAX_STAKE);

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

    console.log("📈 Trade:", direction, "Digit:", digit, "Stake:", stake);

    this.pendingBuy = true;
    this.send(payload);
  }

  /* ================= CONTRACT ================= */

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

    if (profit < 0) this.lossStreak++;
    else this.lossStreak = 0;

    console.log("Result:", profit);

    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      stake: contract.buy_price,
      profit
    });

    if (this.lossStreak >= this.MAX_LOSS_STREAK) {
      console.log("⛔ Cooling down after losses");
      this.user.active = false;
      setTimeout(() => this.user.active = true, 120000);
      this.lossStreak = 0;
    }
  }

  /* ================= SAFETY ================= */

  canTradeNow() {
    const now = Date.now();
    this.tradeTimestamps = this.tradeTimestamps.filter(t => now - t < 60000);

    if (this.tradeTimestamps.length >= this.MAX_TRADES_PER_MIN) return false;

    this.tradeTimestamps.push(now);
    return true;
  }

  checkDailyStop() {
    if (!this.startBalance) return true;

    const loss = this.startBalance - this.currentBalance;

    if (loss >= this.startBalance * this.DAILY_STOP_PCT) {
      console.log("🛑 Daily loss reached. Bot paused.");
      return false;
    }

    return true;
  }
}