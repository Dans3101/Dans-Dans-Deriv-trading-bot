export class UserSession {
  constructor(data) {
    // Destructure properties from data, allowing for defaults
    const { 
      userId, 
      apiToken, 
      market, 
      accountType = 'demo',
      totalProfit = 0,
      tradesToday = 0,
      currentMultiplier = 1,
      baseStake = 2.0
    } = data;

    this.userId = userId;
    this.apiToken = apiToken;
    this.market = market || 'R_100';
    this.accountType = accountType;

    /* ================= CONNECTION ================= */
    this.ws = null;

    /* ================= PERSISTENT STATE ================= */
    // These now accept values passed from users.json during startup
    this.totalProfit = Number(totalProfit);
    this.tradesToday = Number(tradesToday);
    this.currentMultiplier = Number(currentMultiplier);
    this.baseStake = Number(baseStake);

    /* ================= ACCOUNT STATE ================= */
    this.startBalance = 0;
    this.currentBalance = 0;
    this.maxBalance = 0;
    this.active = false;
    this.inTrade = false;

    /* ================= MARTINGALE STATE ================= */
    this.lastTradeResult = null; 
    this.lastTradeProfit = 0;
    this.maxMartingaleSteps = 7; // Increased for Over 5 strategy

    // Force first trade immediately after startup
    this.forceNextTrade = true;

    /* ================= PAYMENT LOGIC ================= */
    this.performanceFeePaid = accountType === 'demo' || true; 
  }
}
