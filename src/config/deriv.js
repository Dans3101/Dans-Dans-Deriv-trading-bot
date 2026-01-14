/**
 * Global Deriv configuration
 * Used by DerivBot, riskManager, and other core modules
 */

export const SETTINGS = {
  // Risk management
  RISK_PERCENT: 0.03,          // 3% per trade
  MAX_TRADES_PER_DAY: 10,

  // Account protection
  STOP_LOSS_PERCENT: 30,      // Stop bot after 30% loss
  TAKE_PROFIT_PERCENT: 200,   // Stop bot after 200% profit

  // Trading config
  CANDLE_GRANULARITY: 60,     // 1-minute candles
  CANDLE_COUNT: 30
};

/**
 * Deriv WebSocket endpoint
 * @param {number|string} appId
 */
export const DERIV_WS = (appId) => {
  return `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
};