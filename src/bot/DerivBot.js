import WebSocket from 'ws';
import { DERIV_WS } from '../config/deriv.js';
import { checkLimits, updateStats, calculateStake } from './riskManager.js';
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
    if (!this.user.active || !this.user.isRunning || this.inTrade || !canTrade(this.user)) return;

    if (this.user.tradeLimit > 0 && this.user.tradesToday >= this.user.tradeLimit) {
        console.log(`[${this.user.userId}] Trade limit reached. Stopping.`);
        this.user.isRunning = false;
        this.safeTelegram(`🛑 Bot ${this.user.userId} reached trade limit of ${this.user.tradeLimit}. Stopped.`);
        return;
    }

    const limits = checkLimits(this.user);
    if (limits !== 'OK') return;

    const finalStake = stake || 2.0;
    this.inTrade = true;

    const payload = {
      buy: 1,
      price: finalStake,
      parameters: {
        amount: finalStake,
        basis: 'stake',
        contract_type: 'DIGITOVER',
        currency: 'USD',
        duration: 1,
        duration_unit: 't',
        symbol: this.user.market || 'R_100',
        barrier: "5" 
      }
    };

    if (this.user.ws?.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(payload));
      
      // === NEW: TRACKING FOR MARKUP REVENUE ===
      // This calls the hook we added in index.js to track your 0.1% earnings
      if (this.bot && typeof this.bot.onTradeExecuted === 'function') {
        this.bot.onTradeExecuted(finalStake);
      }
    } else {
      this.inTrade = false;
    }
  }

  handleContractUpdate(contract) {
    if (!contract?.is_sold) return;
    
    const profit = Number(contract.profit);
    const result = profit >= 0 ? 'WIN' : 'LOSS';
    
    updateStats(this.user, profit);
    this.user.lifetimeProfit = (Number(this.user.lifetimeProfit) || 0) + profit;
    
    console.log(`[${this.user.userId}] 💰 ${result}: $${profit.toFixed(2)} | Session: $${this.user.totalProfit.toFixed(2)} | Lifetime: $${this.user.lifetimeProfit.toFixed(2)}`);
    
    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: 'DIGITOVER',
      stake: contract.buy_price || 0,
      profit,
      balance: this.user.currentBalance
    });

    this.inTrade = false;
  }
}

export class DerivBot {
  constructor(user) {
    this.user = user;
    this.user.active = false;
    this.user.isRunning = user.isRunning !== undefined ? user.isRunning : true;
    this.user.tradeLimit = user.tradeLimit || 0;
    this.user.currentBalance = 0;
    this.user.tradesToday = user.tradesToday || 0;
    this.user.totalProfit = user.totalProfit || 0;
    this.user.lifetimeProfit = user.lifetimeProfit || 0;
    this.user.currentMultiplier = user.currentMultiplier || 1;
    
    // Safety Hooks for index.js
    this.onConnectionError = null; 
    this.onTradeExecuted = null;

    if (!this.user.baseStake) this.user.baseStake = 2.0;
    if (!this.user.targetProfit) this.user.targetProfit = 607; 
    
    this.accBot = new AccumulatorBot(this.user, this);
    this.digitMonitor = createDigitMonitor({ windowSize: 50 });
    if (!this.user.market) this.user.market = 'R_100';
  }

  stop() {
    this.user.isRunning = false;
    console.log(`[${this.user.userId}] Bot manually stopped.`);
  }

  start(newLimit = 0) {
    this.user.tradesToday = 0;
    this.user.totalProfit = 0;
    this.user.currentMultiplier = 1; 
    this.user.tradeLimit = newLimit;
    this.user.isRunning = true;
    console.log(`[${this.user.userId}] Bot Session Reset.`);
  }

  connect() {
    // === NEW: USES THE RENDER ENV APP ID OR YOUR REGISTERED ONE ===
    const appId = process.env.DERIV_APP_ID || "129457";
    
    // Connect to Deriv using WebSocket
    this.user.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);

    // === NEW: CRITICAL ERROR HANDLING (STOPS RENDER CRASH) ===
    this.user.ws.on('error', err => {
      console.error(`❌ WS Error for ${this.user.userId}:`, err.message);
      if (this.onConnectionError) this.onConnectionError(err);
    });

    this.user.ws.on('open', () => { 
        this.authorize(); 
    });

    this.user.ws.on('message', msg => {
      try {
        const data = JSON.parse(msg);
        
        // Handle API level errors (like invalid tokens)
        if (data.error) {
          console.error(`⚠️ Deriv API Error [${this.user.userId}]:`, data.error.message);
          if (data.msg_type === 'buy') this.accBot.inTrade = false;
          if (data.error.code === 'AuthorizationRequired' || data.error.code === 'InvalidToken') {
              this.user.isRunning = false; // Stop bot if token is bad
          }
          return;
        }
        this.handleMessage(data);
      } catch (e) { console.error("JSON Error:", e.message); }
    });

    this.user.ws.on('close', () => { 
        this.user.active = false; 
        if (this.user.isRunning) {
            // Reconnect after 5 seconds if bot is supposed to be running
            setTimeout(() => this.connect(), 5000); 
        }
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
        this.user.ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: data.buy.contract_id, subscribe: 1 }));
        break;
      case 'proposal_open_contract':
        const contract = data.proposal_open_contract;
        if (contract.is_sold) {
          this.digitMonitor.onResult(contract.profit >= 0 ? 'win' : 'loss');
          this.accBot.handleContractUpdate(contract);
          if (data.subscription) this.user.ws.send(JSON.stringify({ forget: data.subscription.id }));
        }
        break;
    }
  }

  handleTick(tick) {
    if (!tick?.quote || !this.user.isRunning) return;
    this.digitMonitor.add(tick.quote);
    
    const prediction = decideFromMonitor(this.digitMonitor);
    
    if (prediction !== null) {
      const dynamicStake = calculateStake(this.user);
      this.accBot.placeTrade(prediction, dynamicStake); 
    }
  }
}
