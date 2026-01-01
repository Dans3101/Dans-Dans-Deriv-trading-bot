import WebSocket from 'ws';
import { DERIV_WS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';
import { sendTelegram } from '../notifications/telegram.js';
import { canTrade } from '../middleware/paymentGuard.js';

export class DerivBot {
  constructor(user) {
    this.user = user;

    this.candles = [];
    this.currentContractId = null;

    this.user.active = false;
    this.user.inTrade = false;
    this.user.startBalance = 0;
    this.user.currentBalance = 0;
    this.user.maxBalance = 0;
    this.user.tradesToday = 0;
  }

  /* ================= CONNECTION ================= */

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] Connected to Deriv`);
      this.authorize();
    });

    this.user.ws.on('message', (msg) => {
      this.handleMessage(JSON.parse(msg));
    });

    this.user.ws.on('close', () => {
      console.log(`[${this.user.userId}] Connection closed`);
      this.user.active = false;
      sendTelegram(`🛑 Bot stopped for ${this.user.userId}`);
    });

    this.user.ws.on('error', (err) => {
      console.error(`[${this.user.userId}] WS Error`, err.message);
    });
  }

  send(data) {
    this.user.ws.send(JSON.stringify(data));
  }

  authorize() {
    this.send({ authorize: this.user.apiToken });
  }

  /* ================= MESSAGE HANDLER ================= */

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        sendTelegram(`🤖 Bot started for ${this.user.userId}`);
        this.subscribeBalance();
        this.getCandles();
        break;

      case 'balance':
        this.handleBalance(data.balance.balance);
        break;

      case 'candles':
        this.candles = data.candles;
        this.tryTrade();
        break;

      case 'buy':
        this.currentContractId = data.buy.contract_id;
        this.subscribeContract();
        break;

      case 'proposal_open_contract':
        this.handleContractUpdate(data.proposal_open_contract);
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
    this.send({
      ticks_history: this.user.market,
      style: 'candles',
      granularity: 60,
      count: 30
    });
  }

  /* ================= TRADING LOGIC ================= */

  tryTrade() {
    if (!this.user.active) return;
    if (this.user.inTrade) return;

    // Performance fee enforcement
    if (!canTrade(this.user)) {
      sendTelegram(
        `💰 Performance fee unpaid. Bot locked for ${this.user.userId}`
      );
      this.user.ws.close();
      return;
    }

    // Risk & daily limits
    const status = checkLimits(this.user);
    if (status !== 'OK') {
      sendTelegram(`🛑 Bot stopped for ${this.user.userId} – ${status}`);
      this.user.ws.close();
      return;
    }

    const direction = decideTradeDirection(this.candles);
    if (!direction) return;

    const stake = calculateStake(this.user.currentBalance);

    this.user.inTrade = true;
    this.user.tradesToday++;

    console.log(
      `[${this.user.userId}] ${direction} | Stake $${stake.toFixed(2)}`
    );

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

    const result = profit >= 0 ? 'WIN' : 'LOSS';

    console.log(
      `[${this.user.userId}] ${result} | Profit: ${profit}`
    );

    sendTelegram(
      `📊 ${this.user.userId} ${result}\nProfit: ${profit.toFixed(2)}`
    );

    // Small delay before next cycle
    setTimeout(() => this.getCandles(), 3000);
  }
}