import WebSocket from 'ws';
import { DERIV_WS } from '../config/deriv.js';
import { calculateStake, checkLimits } from './riskManager.js';
import { decideTradeDirection } from './strategy.js';

export class DerivBot {
  constructor(user) {
    this.user = user;
    this.candles = [];
  }

  connect() {
    const appId = process.env.DERIV_APP_ID || 1089;
    this.user.ws = new WebSocket(DERIV_WS(appId));

    this.user.ws.on('open', () => {
      console.log(`[${this.user.userId}] Connected`);
      this.authorize();
    });

    this.user.ws.on('message', (msg) =>
      this.handleMessage(JSON.parse(msg))
    );

    this.user.ws.on('close', () => {
      console.log(`[${this.user.userId}] Disconnected`);
      this.user.active = false;
    });
  }

  send(data) {
    this.user.ws.send(JSON.stringify(data));
  }

  authorize() {
    this.send({ authorize: this.user.apiToken });
  }

  handleMessage(data) {
    switch (data.msg_type) {
      case 'authorize':
        this.subscribeBalance();
        this.getCandles();
        break;

      case 'balance':
        if (!this.user.startBalance) {
          this.user.startBalance = data.balance.balance;
        }
        this.user.currentBalance = data.balance.balance;
        this.user.active = true;
        break;

      case 'candles':
        this.candles = data.candles;
        this.tryTrade();
        break;

      case 'proposal_open_contract':
        this.handleTradeResult(data.proposal_open_contract);
        break;
    }
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  getCandles() {
    this.send({
      ticks_history: this.user.market,
      style: 'candles',
      granularity: 60,
      count: 30
    });
  }

  tryTrade() {
    if (!this.user.active || this.user.inTrade) return;

    const status = checkLimits(this.user);
    if (status !== 'OK') {
      console.log(`[${this.user.userId}] Bot stopped: ${status}`);
      this.user.ws.close();
      return;
    }

    const direction = decideTradeDirection(this.candles);
    if (!direction) return;

    const stake = calculateStake(this.user.currentBalance);

    console.log(
      `[${this.user.userId}] Trade ${direction} | Stake ${stake.toFixed(2)}`
    );

    this.user.inTrade = true;
    this.user.tradesToday++;

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

  handleTradeResult(contract) {
    if (!contract.is_sold) return;

    const profit = contract.profit;
    this.user.inTrade = false;

    console.log(
      `[${this.user.userId}] Trade result: ${profit >= 0 ? 'WIN' : 'LOSS'} (${profit})`
    );

    // Request new candles for next trade
    setTimeout(() => this.getCandles(), 3000);
  }
}
