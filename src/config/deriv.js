/**
 * Global Deriv configuration
 * Used by DerivBot, riskManager, and other core modules
 */

export const SETTINGS = {
  /* ================= RISK MANAGEMENT ================= */

  // Base risk per trade (used before martingale)
  RISK_PERCENT: 0.05,          // 5% (recommended for 1m synthetics)

  MAX_STAKE: 100,              // Absolute safety cap
  MAX_TRADES_PER_DAY: 15,

  /* ================= ACCOUNT PROTECTION ================= */

  STOP_LOSS_PERCENT: 0.30,     // Stop bot after 30% drawdown
  STOP_PROFIT_MULTIPLIER: 2,   // Stop after 200% profit (2x balance)

  /* ================= TRADING CONFIG ================= */

  CANDLE_GRANULARITY: 60,      // 1-minute candles
  CANDLE_COUNT: 30,

  /* ================= MARTINGALE ================= */

  MAX_MARTINGALE_STEPS: 5,     // Hard stop after losses
  MARTINGALE_MULTIPLIER: 2     // Classic martingale
};

/**
 * Deriv WebSocket endpoint
 * @param {number|string} appId
 */
export const DERIV_WS = (appId) => {
  return `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
};