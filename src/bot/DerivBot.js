import WebSocket from 'ws';
import { DERIV_WS } from '../config/deriv.js';
import { createDigitMonitor, decideFromMonitor } from './digitStrategy.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

// 🔥 Essential for Staff Portal visibility
export const bots = new Map(); 

export class DerivBot {
  constructor(user) {
    this.user = user;

    // Set default market if not provided
    if (!this.user.market) this.user.market = 'R_100';

    this.user.active = false;
    this.user.inTrade = false;
    this.user.currentBalance = 0;
    this.user.startBalance = 0;

    this.currentContractId = null;
    this.pendingBuy = false;

    // 🔥 Initialize the Monitor with 60-tick window
    this.digitMonitor = createDigitMonitor({ windowSize: 60 });

    // 🔥 Register this bot instance globally so index.js can see it
    bots.set(this.user.userId, this);
    console.log(`[System] Bot initialized for ${this.user.userId}`);
  }

  /* ================= CONNECTION ================= */

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] Connected to Deriv`);
      this.authorize();
    });

    this.user.ws.on('message', msg => {
      this.handleMessage(JSON.parse(msg));
    });

    this.user.ws.on('close', () => {
      console.log(`[${this.user.userId}] Disconnected - Retrying...`);
      this.user.active = false;
      setTimeout(() => this.connect(), 5000);
    });

    this.user.ws.on('error', (err) => {
        console.error(`[${this.user.userId}] Connection Error:`, err.message);
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
    if (data.error) {
        console.error(`[${this.user.userId}] API Error:`, data.error.message);
        return;
    }

    switch (data.msg_type) {
      case 'authorize':
        console.log(`[${this.user.userId}] Authorized`);
        this.subscribeBalance();
        this.subscribeTicks();
        break;

      case 'balance':
        this.user.currentBalance = data.balance.balance;
        if (!this.user.startBalance) this.user.startBalance = data.balance.balance;
        this.user.active = true;
        break;

      case 'tick':
        this.handleTick(data.tick);
        break;

      case 'buy':
        this.pendingBuy = false;
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
    if (!tick?.quote || !this.user.active || this.user.inTrade || this.pendingBuy) return;

    // 1. Update the digit stats
    this.digitMonitor.add(tick.quote);

    // 2. Check strategy for "DIGITOVER" decision
    const direction = decideFromMonitor(this.digitMonitor);

    if (direction === "DIGITOVER" && canTrade(this.user)) {
      // Use User Manual Stake
      const stake = Number(this.user.manualStake) || 0.35;
      
      if (this.user.currentBalance < stake) return;

      // Calculate barrier based on the monitor's logic
      // In our digitStrategy, we look for weakest digit, trade OVER (weakest-1)
      const stats = this.digitMonitor.getStats();
      const highDigits = [6, 7, 8, 9];
      let weakest = 6;
      let minPct = 100;
      
      stats.percentages.forEach((pct, d) => {
          if (highDigits.includes(d) && pct < minPct) {
              minPct = pct;
              weakest = d;
          }
      });

      const barrier = weakest - 1;

      const payload = {
        buy: 1,
        price: stake,
        parameters: {
          amount: stake,
          basis: 'stake',
          contract_type: 'DIGITOVER',
          currency: 'USD',
          duration: 1,
          duration_unit: 's',
          symbol: this.user.market,
          barrier: barrier
        }
      };

      this.pendingBuy = true;
      this.send(payload);
      console.log(`🎯 [${this.user.userId}] Over ${barrier} Trade Placed ($${stake})`);
    }
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
    const result = profit >= 0 ? 'win' : 'loss';

    // 🔥 Send result back to monitor to trigger pauses
    this.digitMonitor.onResult(result);

    this.user.inTrade = false;
    this.pendingBuy = false;
    this.currentContractId = null;

    console.log(`[${this.user.userId}] Result: ${result.toUpperCase()} | Profit: ${profit}`);

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
      ticks: this.user.market,
      subscribe: 1
    });
  }
}
