// src/bot/DerivBot.js

import WebSocket from 'ws';
import { DERIV_WS, SETTINGS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';
import { createDigitMonitor, decideFromMonitor } from './digitStrategy.js'; // Ensure this matches your file exports
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

// 🔥 Registry for Staff Portal Visibility
export const bots = new Map(); 

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

    // 🔥 Priority: Use manual stake if available, else use baseStake
    let stake = Number(this.user.manualStake) || this.baseStake;  
    if (this.lastProfit > 0 && !this.user.manualStake) stake = +(stake * 1.2).toFixed(2);  

    const MIN_STAKE = Number(this.user.minStake) || 0.31;  
    const MAX_STAKE = Number(this.user.maxStake) || 100.0;  

    stake = Math.round(Number(stake) * 100) / 100;  
    if (stake < MIN_STAKE) stake = MIN_STAKE;  
    if (stake > MAX_STAKE) stake = MAX_STAKE;  

    const balance = Number(this.user.currentBalance || 0);  
    if (balance < stake) return;  

    this.inTrade = true;  
    const payload = {  
      buy: 1,  
      price: stake,  
      parameters: {  
        amount: stake, basis: 'stake', contract_type: 'ACCU',
        currency: 'USD', duration: 1, duration_unit: 'm', symbol: this.user.market  
      }  
    };  

    console.log(`[${this.user.userId}] SEND BUY (acc) payload:`, JSON.stringify(payload));  
    if (this.user.ws?.readyState === WebSocket.OPEN) {  
      this.user.ws.send(JSON.stringify(payload));  
    } else {  
      this.inTrade = false;  
    }
  }

  handleContractUpdate(contract) {
    if (!contract?.is_sold) return;
    const profit = Number(contract.profit);  
    this.inTrade = false;  
    this.lastProfit = profit;  
    logTrade({  
      userId: this.user.userId, market: this.user.market, direction: 'ACCUMULATOR',  
      stake: contract.buy_price || 0, profit, balance: this.user.currentBalance  
    });
  }
}

export class DerivBot {
  constructor(user) {
    this.user = user;
    this.candles = [];  
    this.user.active = false;  
    this.user.inTrade = false;  
    this.user.currentBalance = 0;  
    this.user.tradesToday = 0;  
    this.tickBuffer = [];  
    this.tradeTimestamps = [];  
    this.MAX_TRADES_PER_MIN = this.user.maxTradesPerMin || 10;  

    this.accBot = new AccumulatorBot(this.user, this);  
    this.digitMonitor = createDigitMonitor({ windowSize: 60 });  

    this.pendingBuy = false;  
    this.PENDING_BUY_TIMEOUT_MS = 5000;  

    if (!this.user.market) this.user.market = 'R_100';

    // 🔥 Fix: Register in global Map for Staff Portal
    bots.set(this.user.userId, this);
    console.log(`[${this.user.userId}] Bot Registry Updated`);
  }

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {  
      console.log(`[${this.user.userId}] ✅ Connected`);  
      this.authorize();  
      this.startTradeLoop();  
      this.startAccumulatorLoop();  
    });  

    this.user.ws.on('message', msg => {  
      try { this.handleMessage(JSON.parse(msg)); } 
      catch (e) { console.error(`[${this.user.userId}] ❌ JSON error`, e.message); }  
    });  

    this.user.ws.on('close', () => {  
      this.user.active = false;  
      this.scheduleReconnect();  
    });  
  }

  scheduleReconnect() {
    setTimeout(() => {
      console.log(`[${this.user.userId}] 🔁 Reconnecting...`);
      this.connect();
    }, 5000);
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

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        console.log(`[${this.user.userId}] ✅ Authorized`);
        this.subscribeBalance();
        this.subscribeCandles();
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
          this.user.tradesToday++;
          this.send({ proposal_open_contract: 1, contract_id: data.buy.contract_id, subscribe: 1 });
        }
        break;
      case 'proposal_open_contract':
        if (data.proposal_open_contract?.contract_type === 'ACCU') {
          this.accBot.handleContractUpdate(data.proposal_open_contract);
        } else if (data.proposal_open_contract.is_sold) {
          this.user.inTrade = false;
          logTrade({
              userId: this.user.userId, market: this.user.market,
              direction: 'DIGIT', stake: data.proposal_open_contract.buy_price,
              profit: data.proposal_open_contract.profit, balance: this.user.currentBalance
          });
        }
        break;
    }
  }

  handleTick(tick) {
    if (!tick?.quote) return;
    this.digitMonitor.add(tick.quote);
    
    // Digit Strategy logic
    if (this.user.market.includes('100')) {
        const direction = decideFromMonitor(this.digitMonitor);
        if (direction && !this.user.inTrade && !this.pendingBuy && this.user.active) {
            // 🔥 Use manualStake
            const stake = Number(this.user.manualStake) || 0.35;
            this.pendingBuy = true;
            this.send({
                buy: 1, price: stake,
                parameters: {
                    amount: stake, basis: 'stake', contract_type: direction,
                    currency: 'USD', duration: 1, duration_unit: 's', symbol: this.user.market
                }
            });
        }
    }
  }

  subscribeBalance() { this.send({ balance: 1, subscribe: 1 }); }

  subscribeCandles() {
    this.send({ ticks: this.user.market, subscribe: 1 });
  }

  startTradeLoop() {
    if (this.tradeLoop) return;
    this.tradeLoop = setInterval(() => {
        // Candle strategy loop logic here if needed
    }, 1000);
  }

  startAccumulatorLoop() {
    setInterval(() => {
      if (this.user.active) this.accBot.placeTrade();
    }, 5 * 60 * 1000);
  }

  canTradeNow() {
    const now = Date.now();
    this.tradeTimestamps = this.tradeTimestamps.filter(ts => now - ts < 60000);
    return this.tradeTimestamps.length < this.MAX_TRADES_PER_MIN;
  }
}
