// src/bot/accumulatorBot.js
import { sendTelegramMessage } from '../notifications/telegram.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

export class AccumulatorBot {
  constructor(user) {
    this.user = user;
    this.inTrade = false;
    this.currentContractId = null;
    this.lastTelegramSent = 0;
    this.telegramInterval = 2000;
  }

  safeTelegram(message) {
    const now = Date.now();
    if (now - this.lastTelegramSent < this.telegramInterval) return;
    this.lastTelegramSent = now;
    sendTelegramMessage(message);
  }

  placeTrade(amount, duration = 1) {
    if (!this.user.active) return;
    if (this.inTrade) return;
    if (!canTrade(this.user)) return;

    const limits = checkLimits(this.user);
    if (limits !== 'OK') {
      console.log(`[ACC] ❌ Limit hit: ${limits}`);
      return;
    }

    this.inTrade = true;

    console.log(`[ACC TRADE] 🚀 Placing Accumulator $${amount}`);
    this.safeTelegram(`🚀 ${this.user.userId} | Accumulator | $${amount}`);

    this.user.ws.send(JSON.stringify({
      buy: 1,
      price: amount,
      parameters: {
        amount,
        basis: 'stake',
        contract_type: 'ACCU', // Accumulator type
        currency: 'USD',
        duration,
        duration_unit: 'm',
        symbol: this.user.market
      }
    }));
  }

  handleContractUpdate(contract) {
    if (!contract.is_sold) return;

    const profit = Number(contract.profit);
    this.inTrade = false;
    this.currentContractId = null;

    const result = profit >= 0 ? 'WIN' : 'LOSS';

    console.log(`[ACC RESULT] ${result} | Profit: ${profit}`);
    this.safeTelegram(`[ACC RESULT] ${this.user.userId} | ${result} | Profit: ${profit}`);

    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: 'ACCUMULATOR',
      stake: contract.buy_price || 0,
      profit,
      balance: this.user.currentBalance
    });
  }
}