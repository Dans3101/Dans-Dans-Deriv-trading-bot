export class UserSession {
  constructor({ userId, apiToken, market, accountType = 'demo' }) {
    this.userId = userId;
    this.apiToken = apiToken;
    this.market = market;
    this.accountType = accountType; // "demo" or "real"

    this.ws = null;
    this.startBalance = 0;
    this.currentBalance = 0;
    this.tradesToday = 0;
    this.active = false;
    this.inTrade = false;

    // Real accounts start as unpaid
    this.performanceFeePaid = accountType === 'demo';
  }
}