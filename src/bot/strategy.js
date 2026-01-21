// src/bot/strategy.js

/**
 * Momentum-based strategy (martingale-safe)
 * - Confirms direction using last 3 candles
 * - Avoids flat / tiny movements
 */

function candleDirection(c) {
  return Number(c.close) - Number(c.open);
}

export function decideTradeDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 5) return null;

  const last3 = candles.slice(-3);

  const moves = last3.map(candleDirection);

  // Ignore bad data
  if (moves.some(m => isNaN(m))) return null;

  const upMoves = moves.filter(m => m > 0).length;
  const downMoves = moves.filter(m => m < 0).length;

  // Minimum movement filter (avoid flat candles)
  const minMove = 0.05;
  const strongMove = Math.abs(moves[moves.length - 1]) >= minMove;

  if (!strongMove) return null;

  // 🔹 CALL: strong upward momentum
  if (upMoves >= 2 && downMoves === 0) {
    return 'CALL';
  }

  // 🔹 PUT: strong downward momentum
  if (downMoves >= 2 && upMoves === 0) {
    return 'PUT';
  }

  return null;
}