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
    if (!this.user.active || this.inTrade || !canTrade(this.user)) return;

    const limits = checkLimits(this.user);
    if (limits !== 'OK') return;

    // Use the dynamic stake calculated by riskManager (Martingale ready)
    const finalStake = stake || 2.0;

    this.inTrade = true;

    const payload = {
      buy: 1,
      price: finalStake,
      parameters: {
        amount: finalStake,
        basis: 'stake',
        contract_type: 'DIGITOVER', // CHANGED: From DIGITDIFF to DIGITOVER
        currency: 'USD',
        duration: 1,
        duration_unit: 't',
        symbol: this.user.market || 'R_100',
        barrier: "5" // CHANGED: Prediction is now Over 5 (Wins on 6, 7, 8, 9)
      }
    };

    console.log(`[${this.user.userId}] 🚀 PRINTING: Over 5 | Stake: $${finalStake}`);
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
    
    // updateStats handles the Martingale multiplier inside riskManager
    updateStats(this.user, profit);
    
    console.log(`[${this.user.userId}] 💰 ${result}: $${profit.toFixed(2)} | Today: ${this.user.tradesToday}`);
    this.safeTelegram(`🔔 ${result} | P: $${profit.toFixed(2)} | Today: ${this.user.tradesToday} | Bal: ${this.user.currentBalance}`);

    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: 'DIGITOVER', // Updated log label
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
    this.user.currentBalance = 0;
    this.user.tradesToday = 0;
    this.user.totalProfit = 0;
    
    // XML Settings: Target $607 profit, Base stake $2
    if (!this.user.baseStake) this.user.baseStake = 2.0;
    if (!this.user.targetProfit) this.user.targetProfit = 607; 
    
    this.accBot = new AccumulatorBot(this.user, this);
    this.digitMonitor = createDigitMonitor({ windowSize: 50 });
    if (!this.user.market) this.user.market = 'R_100';
  }

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));
    this.user.ws.on('open', () => { 
        console.log(`[${this.user.userId}] Connection Active`); 
        this.authorize(); 
    });
    this.user.ws.on('message', msg => {
      try {
        const data = JSON.parse(msg);
        if (data.error) {
          console.error(`[${this.user.userId}] API Error:`, data.error.message);
          if (data.msg_type === 'buy') this.accBot.inTrade = false;
          return;
        }
        this.handleMessage(data);
      } catch (e) { console.error("JSON Error:", e.message); }
    });
    this.user.ws.on('close', () => { 
        this.user.active = false; 
        setTimeout(() => this.connect(), 5000); 
    });
  }

  authorize() { this.user.ws.send(JSON.stringify({ authorize: this.user.apiToken })); }

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
          // Send result to monitor for pause/trend logic
          this.digitMonitor.onResult(contract.profit >= 0 ? 'win' : 'loss');
          this.accBot.handleContractUpdate(contract);
          if (data.subscription) this.user.ws.send(JSON.stringify({ forget: data.subscription.id }));
        }
        break;
    }
  }

  handleTick(tick) {
    if (!tick?.quote) return;
    this.digitMonitor.add(tick.quote);
    
    // The strategy now decides based on the "Over 5" logic
    const prediction = decideFromMonitor(this.digitMonitor);
    
    if (prediction !== null) {
      const dynamicStake = calculateStake(this.user);
      this.accBot.placeTrade(prediction, dynamicStake); 
    }
  }
}
