// src/bot/strategy.js

/**
 * Balanced Momentum Strategy for R_50 (1m)
 * Filters low-volatility noise and confirms momentum before trading
 */

function movePercent(candle) {
  const o = Number(candle.open);
  const c = Number(candle.close);
  if (isNaN(o) || isNaN(c)) return null;
  return ((c - o) / o) * 100;
}

function bodySize(candle) {
  const o = Number(candle.open);
  const c = Number(candle.close);
  if (isNaN(o) || isNaN(c)) return null;
  return Math.abs(c - o);
}

export function decideTradeDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 4) return null;

  const recent = candles.slice(-4);
  const moves = recent.map(movePercent);
  const bodies = recent.map(bodySize);

  if (moves.some(m => m === null) || bodies.some(b => b === null)) return null;

  /* ========= BASIC VOLATILITY FILTER ========= */
  const avgBody = bodies.reduce((a, b) => a + b, 0) / bodies.length;
  if (avgBody < 0.08) return null; // avoid flat/noisy markets

  /* ========= MOMENTUM COUNT ========= */
  const upCount = moves.filter(m => m > 0.015).length;
  const downCount = moves.filter(m => m < -0.015).length;

  /* ========= LAST CANDLE CONFIRMATION ========= */
  const lastMove = moves[moves.length - 1];
  const lastBody = bodies[bodies.length - 1];

  if (lastBody < avgBody * 0.6) return null; // weak candle, skip

  /* ========= TRADE LOGIC ========= */
  if (upCount >= 3 && lastMove > 0) {
    return 'CALL'; // bullish momentum
  }

  if (downCount >= 3 && lastMove < 0) {
    return 'PUT'; // bearish momentum
  }

  return null;
}