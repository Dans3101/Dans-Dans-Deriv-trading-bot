// src/bot/strategy.js

/**
 * Balanced Momentum Strategy for R_50 (1m)
 * Trades consistently while filtering bad noise
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
  if (!Array.isArray(candles) || candles.length < 4) return null;

  const c = candles.slice(-4);
  const moves = c.map(movePercent);
  const bodies = c.map(bodySize);

  if (moves.some(m => m === null)) return null;

  /* ========= BASIC VOLATILITY FILTER ========= */
  const avgBody = bodies.reduce((a, b) => a + b, 0) / bodies.length;
  if (avgBody < 0.08) return null; // relaxed (was too strict)

  /* ========= MOMENTUM COUNT ========= */
  const up = moves.filter(m => m > 0.015).length;
  const down = moves.filter(m => m < -0.015).length;

  /* ========= LAST CANDLE CONFIRMATION ========= */
  const lastMove = moves[3];
  const lastBody = bodies[3];

  if (lastBody < avgBody * 0.6) return null;

  /* ========= TRADE LOGIC ========= */
  // Bullish momentum
  if (up >= 3 && lastMove > 0) {
    return 'CALL';
  }

  // Bearish momentum
  if (down >= 3 && lastMove < 0) {
    return 'PUT';
  }

  return null;
}