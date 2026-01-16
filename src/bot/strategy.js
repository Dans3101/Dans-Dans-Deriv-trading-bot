// src/bot/strategy.js

/**
 * Calculate Exponential Moving Average (EMA)
 */
function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) {
    return null;
  }

  const k = 2 / (period + 1);
  let emaValue = values[0];

  for (let i = 1; i < values.length; i++) {
    emaValue = values[i] * k + emaValue * (1 - k);
  }

  return emaValue;
}

/**
 * Calculate simple trend direction from last 3 candles
 */
function shortTrend(candles) {
  if (candles.length < 3) return null;

  const last3 = candles.slice(-3).map(c => Number(c.close));

  if (last3[2] > last3[1] && last3[1] > last3[0]) return 'UP';
  if (last3[2] < last3[1] && last3[1] < last3[0]) return 'DOWN';

  return 'FLAT';
}

/**
 * Smarter trading decision
 */
export function decideTradeDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 25) {
    return null;
  }

  const closes = candles
    .map(c => Number(c.close))
    .filter(v => !isNaN(v));

  if (closes.length < 25) return null;

  const ema10 = ema(closes.slice(-12), 10);
  const ema20 = ema(closes.slice(-22), 20);

  if (!ema10 || !ema20) return null;

  const trend = shortTrend(candles);

  // 🔹 CALL conditions
  if (ema10 > ema20 && trend === 'UP') {
    return 'CALL';
  }

  // 🔹 PUT conditions
  if (ema10 < ema20 && trend === 'DOWN') {
    return 'PUT';
  }

  return null; // No trade
}