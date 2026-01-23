// src/bot/strategy.js

/**
 * Momentum-based strategy (martingale-safe)
 * - Confirms direction using last 3 candles
 * - Uses percentage movement (market-agnostic)
 * - Avoids flat / noisy candles
 */

function candleMovePercent(candle) {
  const open = Number(candle.open);
  const close = Number(candle.close);

  if (!open || !close) return 0;

  return ((close - open) / open) * 100;
}

export function decideTradeDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 5) {
    return null;
  }

  const last3 = candles.slice(-3);
  const moves = last3.map(candleMovePercent);

  // Ignore bad data
  if (moves.some(m => isNaN(m))) {
    return null;
  }

  const upMoves = moves.filter(m => m > 0).length;
  const downMoves = moves.filter(m => m < 0).length;

  /* ===== NOISE FILTER ===== */
  // Minimum % movement of last candle
  const MIN_MOVE_PERCENT = 0.02; // 0.02% ≈ good for 1m synthetics
  const lastMove = Math.abs(moves[moves.length - 1]);

  if (lastMove < MIN_MOVE_PERCENT) {
    return null;
  }

  /* ===== TRADE CONDITIONS ===== */

  // 🔹 CALL: bullish momentum
  if (upMoves >= 2 && downMoves === 0) {
    return 'CALL';
  }

  // 🔹 PUT: bearish momentum
  if (downMoves >= 2 && upMoves === 0) {
    return 'PUT';
  }

  return null;
}