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
    this.user.startBalance = 0; // Added to track session profit
    this.user.tradesToday = 0;

    this.pendingBuy = false;
    this.PENDING_BUY_TIMEOUT_MS = 5000;
    this.authWatchdog = null;

    this.digitMonitor = createDigitMonitor({ windowSize: 60 });

    if (!this.user.market) this.user.market = 'R_100';

    bots.set(this.user.userId, this);
    console.log(`[${this.user.userId}] Bot instance created and registered in Staff Portal.`);
  }

  /* ================= CONNECT ================= */

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    console.log(`[${this.user.userId}] 📡 Attempting connection to Deriv (AppID: ${appId})...`);
    
    // Clear any existing socket before reconnecting
    if (this.user.ws) {
      try { this.user.ws.terminate(); } catch (e) {}
    }

    this.user.ws = new WebSocket(DERIV_WS(appId));

    // Watchdog: If we don't get 'authorize' success within 10 seconds, retry.
    this.authWatchdog = setTimeout(() => {
      if (!this.user.active) {
        console.log(`[${this.user.userId}] ⚠️ Connection timeout during auth. Retrying...`);
        this.connect();
      }
    }, 10000);

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] ✅ WebSocket Opened. Sending Token...`);
      this.authorize();
    });

    this.user.ws.on('message', msg => {
      try {
        const data = JSON.parse(msg);
        if (data.error) {
          console.error(`[${this.user.userId}] ❌ DERIV ERROR: ${data.error.message}`);
          return;
        }
        this.handleMessage(data);
      } catch (err) {
        console.error(`[${this.user.userId}] ❌ JSON parse error`, err.message);
      }
    });

    this.user.ws.on('close', (code, reason) => {
      console.log(`[${this.user.userId}] ❌ Connection Closed (Code: ${code}). Reason: ${reason || 'None'}`);
      this.user.active = false;
      clearTimeout(this.authWatchdog);
      // Prevent rapid reconnection loops
      setTimeout(() => this.connect(), 7000);
    });

    this.user.ws.on('error', (err) => {
      console.error(`[${this.user.userId}] ❌ WebSocket Socket Error:`, err.message);
    });
  }

  send(data) {
    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(data));
    } else {
      console.warn(`[${this.user.userId}] ⚠️ Tried to send data but WS is not OPEN.`);
    }
  }

  authorize() {
    console.log(`[${this.user.userId}] 🔐 Authorizing with Token: ${this.user.apiToken.substring(0, 4)}****`);
    this.send({ authorize: this.user.apiToken });
  }

  /* ================= MESSAGE HANDLER ================= */

  handleMessage(data) {
    switch (data.msg_type) {

      case 'authorize':
        clearTimeout(this.authWatchdog);
        console.log(`[${this.user.userId}] ⭐ AUTHORIZED SUCCESSFUL. Currency: ${data.authorize.currency}`);
        this.user.active = true;
        this.subscribeBalance();
        this.subscribeTicks();
        break;

      case 'balance':
        this.user.currentBalance = data.balance.balance;
        if (!this.user.startBalance) this.user.startBalance = data.balance.balance;
        break;

      case 'tick':
        this.handleTick(data.tick);
        break;

      case 'buy':
        this.pendingBuy = false;
        if (data.buy?.contract_id) {
          console.log(`[${this.user.userId}] 💰 Trade Placed: ${data.buy.contract_id}`);
          this.user.inTrade = true;
          this.user.tradesToday++;
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
        const result = profit >= 0 ? 'win' : 'loss';

        this.digitMonitor.onResult(result);

        logTrade({
          userId: this.user.userId,
          market: this.user.market,
          direction: 'DIGITOVER',
          stake: contract.buy_price,
          profit,
          balance: this.user.currentBalance
        });

        console.log(`[${this.user.userId}] 🏁 CONTRACT END: ${result.toUpperCase()} | Profit: ${profit}`);
        break;
    }
  }

  /* ================= TICK HANDLER ================= */

  handleTick(tick) {
    if (!tick?.quote) return;
    this.digitMonitor.add(tick.quote);

    // Skip if not ready
    if (!this.user.active || this.user.inTrade || this.pendingBuy) return;
    
    // Safety check for payment/access
    if (!canTrade(this.user)) return;

    const signal = decideFromMonitor(this.digitMonitor);
    if (!signal) return;

    // 🔥 MANUAL STAKE CHECK
    const stake = Number(this.user.manualStake);
    if (!stake || stake <= 0) {
      return; // Silent skip to avoid log spam, wait for admin/user to set stake
    }

    if (this.user.currentBalance < stake) {
      console.log(`[${this.user.userId}] ⚠️ Balance ($${this.user.currentBalance}) too low for stake ($${stake})`);
      return;
    }

    this.pendingBuy = true;

    // Safety timeout to reset pending status if 'buy' response never comes
    setTimeout(() => { this.pendingBuy = false; }, this.PENDING_BUY_TIMEOUT_MS);

    console.log(`[${this.user.userId}] 🚀 SIGNAL: ${signal.contract_type} Barrier ${signal.barrier} | Stake: ${stake}`);

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
    console.log(`[${this.user.userId}] 📡 Subscribing to market: ${this.user.market}`);
    this.send({ ticks: this.user.market, subscribe: 1 });
  }
}
