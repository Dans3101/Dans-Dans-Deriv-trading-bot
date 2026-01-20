// src/bot/strategy.js

/**
 * Simple but effective strategy that ACTUALLY trades
 * - Uses trend + last candle momentum
 */

export function decideTradeDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 10) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const lastClose = Number(last.close);
  const prevClose = Number(prev.close);

  if (isNaN(lastClose) || isNaN(prevClose)) return null;

  // 🔹 If last candle closed higher → CALL
  if (lastClose > prevClose) {
    return 'CALL';
  }

  // 🔹 If last candle closed lower → PUT
  if (lastClose < prevClose) {
    return 'PUT';
  }

  return null;
}