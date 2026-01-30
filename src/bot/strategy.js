// src/bot/strategy.js

/**
 * R_50 High-Accuracy Momentum Continuation Strategy (1m)
 * Optimized to reduce false entries and overtrading
 */

function movePercent(candle) {
  const o = Number(candle.open);
  const c = Number(candle.close);
  if (!o || !c) return null;
  return ((c - o) / o) * 100;
}

function bodySize(candle) {
  return Math.abs(Number(candle.close) - Number(candle.open));
}

export function decideTradeDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 6) return null;

  // Last 6 candles give cleaner R_50 structure
  const c = candles.slice(-6);

  const moves = c.map(movePercent);
  if (moves.some(m => m === null)) return null;

  const bodies = c.map(bodySize);

  /* ================= VOLATILITY FILTER ================= */
  const avgBody =
    bodies.reduce((a, b) => a + b, 0) / bodies.length;

  // Market must be moving
  if (avgBody < 0.15) return null;

  /* ================= TREND STRENGTH ================= */
  const trendMoves = moves.slice(0, 3);

  const strongBullTrend = trendMoves.every(m => m > 0.04);
  const strongBearTrend = trendMoves.every(m => m < -0.04);

  if (!strongBullTrend && !strongBearTrend) return null;

  /* ================= CONTROLLED PULLBACK ================= */
  const pullback1 = moves[3];
  const pullback2 = moves[4];

  // Pullback must be small and opposite
  if (strongBullTrend) {
    if (!(pullback1 < 0 && pullback2 <= 0)) return null;
    if (Math.abs(pullback1) > 0.06 || Math.abs(pullback2) > 0.06) return null;
  }

  if (strongBearTrend) {
    if (!(pullback1 > 0 && pullback2 >= 0)) return null;
    if (pullback1 > 0.06 || pullback2 > 0.06) return null;
  }

  /* ================= ENTRY CONFIRMATION ================= */
  const trigger = moves[5];
  const triggerBody = bodies[5];

  // Must break with strength
  if (triggerBody < avgBody * 0.9) return null;

  if (strongBullTrend && trigger > 0.05) {
    return 'CALL';
  }

  if (strongBearTrend && trigger < -0.05) {
    return 'PUT';
  }

  return null;
}