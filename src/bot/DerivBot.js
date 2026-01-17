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
    this.connected = false;

    this.user.active = false;
    this.user.inTrade = false;
    this.user.startBalance = 0;
    this.user.currentBalance = 0;
    this.user.maxBalance = 0;
    this.user.tradesToday = 0;
  }

  /* ================= CONNECTION ================= */

  connect() {
    if (!this.user.apiToken) {
      console.error(`[${this.user.userId}] ❌ Missing API token`);
      return;
    }

    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      this.connected = true;
      console.log(`[${this.user.userId}] Connected to Deriv`);
      sendTelegramMessage(`✅ Bot connected for ${this.user.userId}`);
      this.authorize();
    });

    this.user.ws.on('message', (msg) => {
      try {
        this.handleMessage(JSON.parse(msg));
      } catch (err) {
        console.error(`[${this.user.userId}] JSON parse error:`, err);
      }
    });

    this.user.ws.on('close', () => {
      this.connected = false;
      console.log(`[${this.user.userId}] Connection closed`);
      sendTelegramMessage(`🛑 Bot stopped for ${this.user.userId}`);
      this.user.active = false;
      this.user.inTrade = false;
    });

    this.user.ws.on('error', (err) => {
      console.error(`[${this.user.userId}] WS Error:`, err.message);
      sendTelegramMessage(`⚠️ WebSocket error for ${this.user.userId}`);
    });
  }

  disconnect() {
    if (this.user.ws && this.connected) {
      this.user.ws.close();
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

  /* ================= MESSAGE HANDLER ================= */

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        sendTelegramMessage(`🤖 Bot authorized for ${this.user.userId}`);
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
    if (balance > this.user.maxBalance) this.user.maxBalance = balance;
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
      sendTelegramMessage(
        `💰 Performance fee unpaid. Bot locked for ${this.user.userId}`
      );
      this.disconnect();
      return;
    }

    const status = checkLimits(this.user);
    if (status !== 'OK') {
      sendTelegramMessage(`🛑 Bot stopped for ${this.user.userId} – ${status}`);
      this.disconnect();
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

    sendTelegramMessage(`🚀 Trade Opened: ${direction}\nStake: $${stake.toFixed(2)}`);

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
    sendTelegramMessage(`📊 ${this.user.userId} ${result}\nProfit: ${profit.toFixed(2)}`);

    // Log trade
    logTrade({
      userId: this.user.userId,
      market: this.user.market,
      direction: result,
      stake: contract.buy_price || 0,
      profit,
      balance: this.user.currentBalance
    });

    setTimeout(() => this.getCandles(), 3000);
  }

  /* ================= ADMIN COMMAND METHODS ================= */

  start() {
    if (this.connected) {
      sendTelegramMessage(`ℹ️ Bot for ${this.user.userId} already running`);
      return;
    }
    this.connect();
  }

  stop() {
    if (!this.connected) {
      sendTelegramMessage(`ℹ️ Bot for ${this.user.userId} already stopped`);
      return;
    }
    this.disconnect();
  }

  status() {
    return {
      userId: this.user.userId,
      active: this.user.active,
      inTrade: this.user.inTrade,
      currentBalance: this.user.currentBalance,
      tradesToday: this.user.tradesToday
    };
  }
}