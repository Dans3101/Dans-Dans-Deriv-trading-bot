/**
 * Gold/USD (CFD) configuration for Deriv
 * Symbol: GOLDUSD (Deriv commodities)
 * This file controls ALL gold trading behavior
 */

export const GOLD_CONFIG = {
  /* ================= MARKET ================= */
  SYMBOL: 'GOLDUSD',          // Deriv Gold/USD (NOT XAUUSD)
  MARKET_TYPE: 'cfd',         // CFD trading
  CURRENCY: 'USD',

  /* ================= TIMEFRAME ================= */
  TIMEFRAME: 60,              // 1-minute candles (seconds)
  HISTORY_COUNT: 100,         // Candles to preload

  /* ================= POSITION SIZE ================= */
  LOT_SIZE: 0.01,             // Small & safe for demo
  MAX_OPEN_TRADES: 1,         // Only ONE gold trade at a time

  /* ================= PROFIT / LOSS ================= */
  TARGET_PROFIT: 1.0,         // Close trade when profit ≥ $1
  MAX_LOSS: -3.0,             // Emergency stop-loss ($)

  /* ================= RISK CONTROL ================= */
  MAX_TRADES_PER_HOUR: 10,
  COOLDOWN_AFTER_TRADE: 60,   // seconds before next trade
  MIN_BALANCE: 10,            // Do not trade if balance below this

  /* ================= VOLATILITY FILTER ================= */
  MIN_CANDLE_BODY: 0.15,      // Ignore weak candles
  MIN_ATR: 0.3,               // Minimum volatility (Gold moves well)

  /* ================= SAFETY ================= */
  DEMO_ONLY: true,            // Set FALSE for real account later
  ENABLED: true               // Master switch for gold bot
};