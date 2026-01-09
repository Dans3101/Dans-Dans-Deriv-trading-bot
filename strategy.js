// /bot/strategy.js

/**
 * Calculate Exponential Moving Average (EMA)
 * @param {number[]} values
 * @param {number} period
 * @returns {number|null}
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
 * Decide trade direction using EMA 10 / EMA 20 crossover
 * @param {Array} candles
 * @returns {'CALL' | 'PUT' | null}
 */
export function decideTradeDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 20) {
    return null;
  }

  const closes = candles
    .map(c => Number(c.close))
    .filter(v => !isNaN(v));

  if (closes.length < 20) {
    return null;
  }

  const ema10 = ema(closes.slice(-10), 10);
  const ema20 = ema(closes.slice(-20), 20);

  if (ema10 === null || ema20 === null) {
    return null;
  }

  if (ema10 > ema20) return 'CALL';
  if (ema10 < ema20) return 'PUT';

  return null;
}
