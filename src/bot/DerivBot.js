import WebSocket from 'ws';
import { DERIV_WS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';
import { logTrade } from '../utils/tradeLogger.js';

export class DerivBot {
  constructor(user) {
    this.user = user;

    this.candles = [];
    this.currentContractId = null;
    this.fetchingCandles = false;
    this.reconnectTimeout = null;
    this.heartbeatInterval = null;

    this.user.active = false;
    this.user.inTrade = false;
    this.user.startBalance = 0;
    this.user.currentBalance = 0;
    this.user.maxBalance = 0;
    this.user.tradesToday = 0;

    // Throttle Telegram messages to avoid API spam
    this.lastTelegramSent = 0;
    this.telegramInterval = 2000; // 2 seconds minimum between messages
  }

  /* ================= CONNECTION ================= */

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] Connected to Deriv`);
      this.safeTelegram(`✅ Bot connected for ${this.user.userId}`);
      this.authorize();
      this.startHeartbeat();
    });

    this.user.ws.on('message', (msg) => {
      try {
        this.handleMessage(JSON.parse(msg));
      } catch (err) {
        console.error(`[${this.user.userId}] JSON parse error:`, err.message);
      }
    });

    this.user.ws.on('close', (code) => {
      console.log(`[${this.user.userId}] Connection closed (code: ${code})`);
      this.user.active = false;
      this.safeTelegram(`🛑 Bot disconnected for ${this.user.userId}`);
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.user.ws.on('error', (err) => {
      console.error(`[${this.user.userId}] WS Error:`, err.message);
      this.safeTelegram(`⚠️ WebSocket error for ${this.user.userId}`);
      this.user.ws.close();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) return;

    console.log(`[${this.user.userId}] Attempting reconnect in 5s...`);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 5000);
  }

  startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      if (!this.user.active) return;

      this.safeTelegram(
        `💓 Heartbeat — <b>${this.user.userId}</b>\n` +
          `Balance: $${this.user.currentBalance.toFixed(2)} | ` +
          `Trades today: ${this.user.tradesToday} | ` +
          `In Trade: ${this.user.inTrade ? 'Yes' : 'No'}`,
        true // silent mode to reduce spam
      );
    }, 10 * 60 * 1000); // Every 10 minutes
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  send(data) {
    if (this.user.ws && this.user.ws.readyState === WebSocket.OPEN) {
      this.user.ws.send(JSON.stringify(data));
    }
  }

  authorize() {
    this.send({ authorize: this.user.apiToken });
  }

  /* ================= SAFE TELEGRAM SENDER ================= */
  safeTelegram(message, silent = false) {
    const now = Date.now();
    if (now - this.lastTelegramSent < this.telegramInterval) return;
    this.lastTelegramSent = now;
    sendTelegramMessage(message, silent);
  }

  /* ================= MESSAGE HANDLER ================= */

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        this.safeTelegram(`🤖 Bot authorized for <b>${this.user.userId}</b>`);
        this.subscribeBalance();
        this.getCandles();
        break;

      case 'balance':
        this.handleBalance(data.balance.balance);
        break;

      case 'candles':
        this.candles = data.candles;
        this.fetchingCandles = false;
        this.tryTrade();
        break;

      case 'buy':
        this.currentContractId = data.buy.contract_id;
        this.subscribeContract();
        break;

      case 'proposal_open_contract':
        this.handleContractUpdate(data.proposal_open_contract);
        break;

      default:
        break;
    }
  }

  /* ================= BALANCE ================= */

  handleBalance(balance) {
    if (!this.user.startBalance) {
      this.user.startBalance = balance;
      this.user.maxBalance = balance;
    }

    this.user.currentBalance = balance;

    if (balance > this.user.maxBalance) {
      this.user.maxBalance = balance;
    }

    this.user.active = true;
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  /* ================= CANDLES ================= */

  getCandles() {
    if (this.fetchingCandles) return;

    this.fetchingCandles = true;

    this.send({
      ticks_history: this.user.market,
      style: 'candles',
      granularity: 60,
      count: 30
    });
  }

  /* ================= TRADING LOGIC ================= */

  tryTrade() {
    if (!this.user.active || this.user.inTrade) return;

    if (!canTrade(this.user)) {
      this.safeTelegram(`💰 Performance fee unpaid. Bot locked for <b>${this.user.userId}</b>`);
      this.user.ws.close();
      return;
    }

    const status = checkLimits(this.user);
    if (status !== 'OK') {
      this.safeTelegram(`🛑 Bot stopped for <b>${this.user.userId}</b> – ${status}`);
      this.user.ws.close();
      return;
    }

    const direction = decideTradeDirection(this.candles);
    if (!direction) {
      setTimeout(() => this.getCandles(), 2000);
      return;
    }

    const stake = calculateStake(this.user.currentBalance);

    this.user.inTrade = true;
    this.user.tradesToday++;

    console.log(`[${this.user.userId}] ${direction} | Stake $${stake.toFixed(2)}`);
    this.safeTelegram(`🚀 Trade Opened: ${direction}\nStake: $${stake.toFixed(2)}`);

    this.send({
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: 'stake',
        contract_type: direction,
        currency: 'USD',
        duration: 1,
        duration_unit: 'm',
        symbol: this.user.market
      }
    });
  }

  /* ================= CONTRACT HANDLING ================= */

  subscribeContract() {
    if (!this.currentContractId) return;

    this.send({
      proposal_open_contract: 1,
      contract_id: this.currentContractId,
      subscribe: 1
    });
  }

  handleContractUpdate(contract) {
    if (!contract.is_sold) return;

    const profit = Number(contract.profit);
    this.user.inTrade = false;
    this.currentContractId = null;

    const result = profit >= 0 ? 'WIN ✅' : 'LOSS ❌';

    console.log(`[${this.user.userId}] ${result} | Profit: ${profit}`);

    this.safeTelegram(
      `📊 <b>${this.user.userId}</b> ${result}\nProfit: ${profit.toFixed(2)}`
    );

    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: result,
      stake: contract.buy_price || 0,
      profit: profit,
      balance: this.user.currentBalance
    });

    setTimeout(() => this.getCandles(), 3000);
  }
}