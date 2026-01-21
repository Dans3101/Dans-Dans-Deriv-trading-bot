export class UserSession {
  constructor({ userId, apiToken, market, accountType = 'demo' }) {
    this.userId = userId;
    this.apiToken = apiToken;
    this.market = market;
    this.accountType = accountType; // "demo" or "real"

    /* ================= CONNECTION ================= */
    this.ws = null;

    /* ================= ACCOUNT STATE ================= */
    this.startBalance = 0;
    this.currentBalance = 0;
    this.maxBalance = 0;

    this.tradesToday = 0;
    this.active = false;
    this.inTrade = false;

    /* ================= MARTINGALE STATE ================= */
    this.lastTradeResult = null; // "WIN" | "LOSS"
    this.lastTradeProfit = 0;

    this.martingaleStep = 0;
    this.maxMartingaleSteps = 5; // HARD SAFETY LIMIT
    this.baseStake = null; // remembered initial stake

    // Force first trade immediately after startup
    this.forceNextTrade = true;

    /* ================= PAYMENT LOGIC ================= */
    // Demo accounts always allowed
    this.performanceFeePaid = accountType === 'demo';
  }
}