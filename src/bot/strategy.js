// src/bot/strategy.js

/**
 * Momentum-based strategy (trade-friendly)
 * - Uses last 3 candles
 * - Light noise filter (1m safe)
 * - Guarantees signals over time
 */

function candleMovePercent(candle) {
  const open = Number(candle.open);
  const close = Number(candle.close);

  if (!open || !close) return null;

  return ((close - open) / open) * 100;
}

export function decideTradeDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 3) {
    return null;
  }

  const last3 = candles.slice(-3);
  const moves = last3
    .map(candleMovePercent)
    .filter(m => m !== null);

  if (moves.length < 3) return null;

  const upMoves = moves.filter(m => m > 0).length;
  const downMoves = moves.filter(m => m < 0).length;

  /* ===== LIGHT NOISE FILTER ===== */
  const MIN_MOVE_PERCENT = 0.005; // MUCH safer for 1m candles
  const lastMove = Math.abs(moves[moves.length - 1]);

  if (lastMove < MIN_MOVE_PERCENT) {
    return null;
  }

  /* ===== TRADE CONDITIONS ===== */

  // CALL → bullish momentum
  if (upMoves >= 2) {
    return 'CALL';
  }

  // PUT → bearish momentum
  if (downMoves >= 2) {
    return 'PUT';
  }

  return null;
}