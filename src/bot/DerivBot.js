// src/bot/DerivBot.js

import WebSocket from 'ws';
import { DERIV_WS, SETTINGS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';
import { createDigitStrategy } from './digitStrategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

export class DerivBot {
  constructor(user) {
    this.user = user;

    this.user.market = 'R_10'; // FORCE R_10

    this.user.active = false;
    this.user.inTrade = false;
    this.user.currentBalance = 0;

    this.currentContractId = null;
    this.pendingBuy = false;

    // 🔥 Digit Strategy
    this.digitStrategy = createDigitStrategy({
      contractType: 'DIGITOVER',
      fixedStake: 1 // change stake here if needed
    });

    // 🔥 Loss control
    this.consecutiveLosses = 0;
    this.pauseUntil = 0;
  }

  /* ================= CONNECTION ================= */

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] Connected`);
      this.authorize();
    });

    this.user.ws.on('message', msg => {
      this.handleMessage(JSON.parse(msg));
    });

    this.user.ws.on('close', () => {
      console.log(`[${this.user.userId}] Disconnected`);
      setTimeout(() => this.connect(), 5000);
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
        console.log('Authorized');
        this.subscribeBalance();
        this.subscribeTicks();
        break;

      case 'balance':
        this.user.currentBalance = data.balance.balance;
        this.user.active = true;
        break;

      case 'tick':
        this.handleTick(data.tick);
        break;

      case 'buy':
        if (data.buy?.contract_id) {
          this.currentContractId = data.buy.contract_id;
          this.user.inTrade = true;
          this.subscribeContract();
        }
        break;

      case 'proposal_open_contract':
        this.handleContractUpdate(data.proposal_open_contract);
        break;
    }
  }

  /* ================= TICKS ================= */

  handleTick(tick) {
    if (!tick?.quote) return;

    if (Date.now() < this.pauseUntil) return;
    if (this.user.inTrade || this.pendingBuy || !this.user.active) return;

    const decision = this.digitStrategy.onTick(tick.quote);

    if (!decision) return;

    const payload = {
      buy: 1,
      price: decision.stake,
      parameters: {
        amount: decision.stake,
        basis: 'stake',
        contract_type: 'DIGITOVER',
        currency: 'USD',
        duration: 1,
        duration_unit: 's',
        symbol: 'R_10',
        barrier: decision.barrier
      }
    };

    this.pendingBuy = true;
    this.send(payload);
  }

  /* ================= CONTRACT ================= */

  subscribeContract() {
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
    this.pendingBuy = false;
    this.currentContractId = null;

    if (profit < 0) {
      this.consecutiveLosses++;

      if (this.consecutiveLosses === 1) {
        console.log("⏸ 1 Loss → Pause 30s");
        this.pauseUntil = Date.now() + 30000;
      }

      if (this.consecutiveLosses >= 2) {
        console.log("⛔ 2 Losses → Pause 1 min");
        this.pauseUntil = Date.now() + 60000;
        this.consecutiveLosses = 0;
      }

    } else {
      this.consecutiveLosses = 0;
    }

    console.log(`Result: ${profit >= 0 ? 'WIN' : 'LOSS'} | Profit: ${profit}`);

    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: 'DIGITOVER',
      stake: contract.buy_price,
      profit,
      balance: this.user.currentBalance
    });
  }

  /* ================= SUBSCRIPTIONS ================= */

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  subscribeTicks() {
    this.send({
      ticks: 'R_10',
      subscribe: 1
    });
  }
}