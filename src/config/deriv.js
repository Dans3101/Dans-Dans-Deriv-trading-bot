/**
 * Global Deriv configuration
 * Used by DerivBot, riskManager, and other core modules
 */

export const SETTINGS = {
  /* ================= RISK MANAGEMENT ================= */

  // Base risk per trade (before martingale)
  RISK_PERCENT: 0.05,            // 5% of balance
  MAX_STAKE: 100,                // Absolute Deriv safety cap
  MIN_STAKE: 0.31,               // Minimum stake to use (changed from 0.35 to 0.31)
  // Optional application-level max stake (we'll use 1.00 as requested)
  MAX_STAKE_LIMIT: 1.00,

  MAX_TRADES_PER_DAY: 15,

  /* ================= ACCOUNT PROTECTION ================= */

  STOP_LOSS_PERCENT: 0.30,       // 30% max drawdown
  STOP_PROFIT_MULTIPLIER: 2,     // 2x starting balance (200%)

  /* ================= TRADING CONFIG ================= */

  CANDLE_GRANULARITY: 2,         // 2-second mini-candles for testing (was 60)
  CANDLE_COUNT: 30,

  /* ================= MARTINGALE ================= */

  MAX_MARTINGALE_STEPS: 5,       // Hard stop after losses
  MARTINGALE_MULTIPLIER: 2       // Classic martingale
};

/**
 * Deriv WebSocket endpoint
 * @param {number|string} appId
 */
export const DERIV_WS = (appId) => {
  return `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
}