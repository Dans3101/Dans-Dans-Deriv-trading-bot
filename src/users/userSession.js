export class UserSession {
  constructor({ userId, apiToken, market }) {
    this.userId = userId;
    this.apiToken = apiToken;
    this.market = market;

    this.ws = null;
    this.startBalance = 0;
    this.currentBalance = 0;
    this.tradesToday = 0;
    this.active = false;
    this.inTrade = false;
  }
}
