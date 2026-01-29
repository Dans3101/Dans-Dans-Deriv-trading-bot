// src/bot/strategy.js

/**
 * Momentum-based strategy for Deriv 1-minute candles
 * - Uses last 3 mini-candles
 * - Light noise filter to avoid false trades
 * - Returns 'CALL', 'PUT', or null
 */

/**
 * Calculate percent move of a candle
 * @param {Object} candle - { open, close }
 * @returns {number|null} percent move
 */
function candleMovePercent(candle) {
  const open = Number(candle.open);
  const close = Number(candle.close);

  if (!open || !close) return null;

  return ((close - open) / open) * 100;
}

/**
 * Decide trade direction based on last 3 candles
 * @param {Array} candles - array of candle objects
 * @returns {'CALL'|'PUT'|null}
 */
export function decideTradeDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 3) {
    return null;
  }

  // Take last 3 candles
  const last3 = candles.slice(-3);
  const moves = last3
    .map(candleMovePercent)
    .filter(m => m !== null);

  if (moves.length < 3) return null;

  const upMoves = moves.filter(m => m > 0).length;
  const downMoves = moves.filter(m => m < 0).length;

  // ===== LIGHT NOISE FILTER =====
  const MIN_MOVE_PERCENT = 0.005; // Ignore candles with tiny movement
  const lastMove = Math.abs(moves[moves.length - 1]);
  if (lastMove < MIN_MOVE_PERCENT) {
    return null;
  }

  // ===== TRADE SIGNALS =====
  if (upMoves >= 2) {
    return 'CALL';
  }

  if (downMoves >= 2) {
    return 'PUT';
  }

  return null; // No clear momentum
}