/**
 * Enhanced Momentum Strategy for R_50 (1m)
 * More aggressive while keeping noise filtering
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
  if (!Array.isArray(candles) || candles.length < 3) return null;

  const recent = candles.slice(-4);
  const moves = recent.map(movePercent);
  const bodies = recent.map(bodySize);

  if (moves.some(m => m === null) || bodies.some(b => b === null)) return null;

  /* ========= AVG BODY FILTER ========= */
  const avgBody = bodies.reduce((a, b) => a + b, 0) / bodies.length;
  if (avgBody < 0.05) return null; // slightly more permissive

  /* ========= MOMENTUM COUNT ========= */
  const upCount = moves.filter(m => m > 0.01).length;
  const downCount = moves.filter(m => m < -0.01).length;

  /* ========= LAST CANDLE CONFIRMATION ========= */
  const lastMove = moves[moves.length - 1];
  const lastBody = bodies[bodies.length - 1];
  if (lastBody < avgBody * 0.5) return null; // ignore very weak candle

  /* ========= TREND CONFIRMATION ========= */
  const prev3 = moves.slice(-4, -1);
  const upTrend = prev3.every(m => m > 0);
  const downTrend = prev3.every(m => m < 0);

  /* ========= TRADE LOGIC ========= */
  if (upCount >= 2 && lastMove > 0 && upTrend) return 'CALL';
  if (downCount >= 2 && lastMove < 0 && downTrend) return 'PUT';

  /* ========= OPTIONAL REVERSAL (small pullback) ========= */
  if (upCount === 2 && lastMove < 0 && downTrend) return 'PUT';
  if (downCount === 2 && lastMove > 0 && upTrend) return 'CALL';

  return null; // no confident signal
}