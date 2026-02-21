// src/bot/DerivBot.js

import WebSocket from 'ws';
import { DERIV_WS } from '../config/deriv.js';
import { createDigitMonitor, decideFromMonitor } from './digitStrategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

export const bots = new Map();

export class DerivBot {
  constructor(user) {
    this.user = user;

    this.user.active = false;
    this.user.inTrade = false;
    this.user.currentBalance = 0;
    this.user.tradesToday = 0;

    this.pendingBuy = false;
    this.PENDING_BUY_TIMEOUT_MS = 5000;

    this.digitMonitor = createDigitMonitor({ windowSize: 60 });

    if (!this.user.market) this.user.market = 'R_100';

    bots.set(this.user.userId, this);
    console.log(`[${this.user.userId}] Bot registered`);
  }

  /* ================= CONNECT ================= */

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] ✅ Connected`);
      this.authorize();
    });

    this.user.ws.on('message', msg => {
      try {
        this.handleMessage(JSON.parse(msg));
      } catch (err) {
        console.error(`[${this.user.userId}] JSON error`, err.message);
      }
    });

    this.user.ws.on('close', () => {
      console.log(`[${this.user.userId}] ❌ Disconnected`);
      this.user.active = false;
      setTimeout(() => this.connect(), 5000);
    });
  }

  send(data) {
    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(data));
    }
  }

  authorize() {
    console.log(`[${this.user.userId}] 🔐 Authorizing...`);
    this.send({ authorize: this.user.apiToken });
  }

  /* ================= MESSAGE HANDLER ================= */

  handleMessage(data) {
    switch (data.msg_type) {

      case 'authorize':
        console.log(`[${this.user.userId}] ✅ Authorized`);
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
        this.pendingBuy = false;

        if (data.buy?.contract_id) {
          this.user.inTrade = true;

          this.send({
            proposal_open_contract: 1,
            contract_id: data.buy.contract_id,
            subscribe: 1
          });
        }
        break;

      case 'proposal_open_contract':

        if (!data.proposal_open_contract?.is_sold) return;

        const contract = data.proposal_open_contract;

        this.user.inTrade = false;

        const profit = Number(contract.profit);
        const result = profit > 0 ? 'win' : 'loss';

        // 🔥 Pause logic handled here
        this.digitMonitor.onResult(result);

        logTrade({
          userId: this.user.userId,
          market: this.user.market,
          direction: 'DIGITOVER',
          stake: contract.buy_price,
          profit,
          balance: this.user.currentBalance
        });

        console.log(
          `[${this.user.userId}] ${result.toUpperCase()} | Profit: ${profit}`
        );

        break;
    }
  }

  /* ================= TICK HANDLER ================= */

  handleTick(tick) {
    if (!tick?.quote) return;

    this.digitMonitor.add(tick.quote);

    if (
      !this.user.active ||
      this.user.inTrade ||
      this.pendingBuy ||
      !canTrade(this.user)
    ) return;

    const signal = decideFromMonitor(this.digitMonitor);

    if (!signal) return;

    // 🔥 MANUAL STAKE ONLY
    const stake = Number(this.user.manualStake);

    if (!stake || stake <= 0) {
      console.log(`[${this.user.userId}] ❌ No manual stake set. Bot will not trade.`);
      return;
    }

    if (this.user.currentBalance < stake) {
      console.log(`[${this.user.userId}] ❌ Insufficient balance`);
      return;
    }

    this.pendingBuy = true;

    setTimeout(() => {
      this.pendingBuy = false;
    }, this.PENDING_BUY_TIMEOUT_MS);

    console.log(
      `[${this.user.userId}] 📤 BUY DIGITOVER > ${signal.barrier} | Stake: ${stake}`
    );

    this.send({
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: 'stake',
        contract_type: signal.contract_type,
        barrier: signal.barrier,
        currency: 'USD',
        duration: 1,
        duration_unit: 's',
        symbol: this.user.market
      }
    });
  }

  /* ================= SUBSCRIPTIONS ================= */

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  subscribeTicks() {
    console.log(`[${this.user.userId}] 📡 Subscribing ticks: ${this.user.market}`);
    this.send({ ticks: this.user.market, subscribe: 1 });
  }
}