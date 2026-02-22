// src/bot/DerivBot.js
import WebSocket from 'ws';
import { DERIV_WS } from '../config/deriv.js';
import { checkLimits, updateStats } from './riskManager.js'; // Added updateStats import
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
  }

  safeTelegram(message) {
    const now = Date.now();
    if (now - this.lastTelegramSent < this.telegramInterval) return;
    this.lastTelegramSent = now;
    try {
      sendTelegramMessage(message);
    } catch (err) {
      console.warn('Telegram failed:', err.message);
    }
  }

  placeTrade(prediction, stake) {
    // 1. Check all limits before trying to buy
    if (!this.user.active || this.inTrade || !canTrade(this.user)) return;

    const limits = checkLimits(this.user);
    if (limits !== 'OK') {
      // If limits are hit, we stop trying to trade
      return;
    }

    this.inTrade = true; // Lock the bot to prevent double-entry

    const payload = {
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: 'stake',
        contract_type: 'DIGITDIFF',
        currency: 'USD',
        duration: 1,
        duration_unit: 't',
        symbol: this.user.market || 'R_100',
        barrier: String(prediction)
      }
    };

    console.log(`[${this.user.userId}] 🛒 Buying Digit Differs on: ${prediction}`);
    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(payload));
    } else {
      this.inTrade = false;
    }
  }

  handleContractUpdate(contract) {
    if (!contract?.is_sold) return;
    
    const profit = Number(contract.profit);
    const result = profit >= 0 ? 'WIN' : 'LOSS';
    
    // 2. CRITICAL: Update the riskManager stats (Fixes tradesToday=0 issue)
    updateStats(this.user, profit);
    
    console.log(`[${this.user.userId}] 💰 Trade Finished: ${result} ($${profit})`);
    this.safeTelegram(`🔔 ${result} | Profit: $${profit} | Today: ${this.user.tradesToday} | Bal: ${this.user.currentBalance}`);

    // 3. Log to file
    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: 'DIGITDIFF',
      stake: contract.buy_price || 0,
      profit,
      balance: this.user.currentBalance
    });

    // 4. UNLOCK the bot for the next trade
    this.inTrade = false;
  }
}

export class DerivBot {
  constructor(user) {
    this.user = user;
    this.user.active = false;
    this.user.currentBalance = 0;
    // Initialize stats on the user object if they don't exist
    this.user.tradesToday = 0;
    this.user.totalProfit = 0;
    
    this.accBot = new AccumulatorBot(this.user, this);
    this.digitMonitor = createDigitMonitor({ windowSize: 50 });
    if (!this.user.market) this.user.market = 'R_100';
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
        const data = JSON.parse(msg);
        if (data.error) {
          console.error(`[${this.user.userId}] API Error:`, data.error.message);
          // If a buy failed, unlock the bot
          if (data.msg_type === 'buy') this.accBot.inTrade = false;
          return;
        }
        this.handleMessage(data);
      } catch (e) {
        console.error("JSON Error:", e.message);
      }
    });

    this.user.ws.on('close', () => {
      this.user.active = false;
      console.log(`[${this.user.userId}] Connection closed. Reconnecting...`);
      setTimeout(() => this.connect(), 5000);
    });
  }

  authorize() {
    this.user.ws.send(JSON.stringify({ authorize: this.user.apiToken }));
  }

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        this.user.ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        this.user.ws.send(JSON.stringify({ ticks: this.user.market, subscribe: 1 }));
        break;

      case 'balance':
        this.user.currentBalance = data.balance.balance;
        this.user.active = true;
        break;

      case 'tick':
        this.handleTick(data.tick);
        break;

      case 'buy':
        // Monitor the trade result
        this.user.ws.send(JSON.stringify({
          proposal_open_contract: 1,
          contract_id: data.buy.contract_id,
          subscribe: 1
        }));
        break;

      case 'proposal_open_contract':
        const contract = data.proposal_open_contract;
        if (contract.is_sold) {
          // Tell the digit monitor to handle pause logic
          this.digitMonitor.onResult(contract.profit >= 0 ? 'win' : 'loss');
          // Handle cleanup and unlock
          this.accBot.handleContractUpdate(contract);
          // Unsubscribe from this contract
          if (data.subscription) {
            this.user.ws.send(JSON.stringify({ forget: data.subscription.id }));
          }
        }
        break;
    }
  }

  handleTick(tick) {
    if (!tick?.quote) return;
    this.digitMonitor.add(tick.quote);
    const prediction = decideFromMonitor(this.digitMonitor);
    if (prediction !== null) {
      // Pass the prediction to the trade function
      this.accBot.placeTrade(prediction, 0.35); 
    }
  }
}
