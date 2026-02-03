/**
 * EMA crossover + RSI + body-size filter strategy
 *
 * - Fast EMA / Slow EMA crossover for trend (fast: 3, slow: 8)
 * - RSI(14) for momentum confirmation (overbought/oversold avoided)
 * - Average body size filter to ignore low-volatility periods
 * - Last candle confirmation (direction + sufficient body)
 *
 * Returns 'CALL', 'PUT', or null
 */

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function closesFrom(candles) {
  return candles.map(c => toNumber(c.close));
}

function bodiesFrom(candles) {
  return candles.map(c => {
    const o = toNumber(c.open);
    const cl = toNumber(c.close);
    if (Number.isNaN(o) || Number.isNaN(cl)) return NaN;
    return Math.abs(cl - o);
  });
}

function sma(values) {
  if (!Array.isArray(values) || values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return NaN;
  const k = 2 / (period + 1);
  // start with SMA of first period
  let prev = sma(values.slice(0, period));
  let emaVal = prev;
  for (let i = period; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) return NaN;
    emaVal = v * k + emaVal * (1 - k);
  }
  return emaVal;
}

function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length < period + 1) return NaN;
  let gains = 0;
  let losses = 0;
  // initial average gain/loss from first period
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  // continue smoothing for the rest
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * decideTradeDirection
 * @param {Array} candles - array of candle objects with open, close (strings or numbers)
 * @returns {'CALL'|'PUT'|null}
 */
export function decideTradeDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 16) return null; // need enough history

  // We'll use the last 20 candles for indicators (safe buffer)
  const window = candles.slice(-30);
  const closes = closesFrom(window);
  const bodies = bodiesFrom(window);

  if (closes.some(c => Number.isNaN(c)) || bodies.some(b => Number.isNaN(b))) return null;

  // average body filter (ignore low-volatility)
  const avgBody = sma(bodies.slice(-12));
  if (!Number.isFinite(avgBody) || avgBody < 0.02) return null; // threshold tuned for 1m candles

  // EMA crossover
  const fastPeriod = 3;
  const slowPeriod = 8;
  const fastEma = ema(closes, fastPeriod);
  const slowEma = ema(closes, slowPeriod);
  if (!Number.isFinite(fastEma) || !Number.isFinite(slowEma)) return null;

  // For crossover confirmation, compute previous EMAs (one candle earlier)
  const closesPrev = closes.slice(0, -1);
  const fastPrev = closesPrev.length >= fastPeriod ? ema(closesPrev, fastPeriod) : NaN;
  const slowPrev = closesPrev.length >= slowPeriod ? ema(closesPrev, slowPeriod) : NaN;
  if (!Number.isFinite(fastPrev) || !Number.isFinite(slowPrev)) return null;

  // RSI momentum
  const r = rsi(closes, 14);
  if (!Number.isFinite(r)) return null;

  // last candle confirmation
  const last = window[window.length - 1];
  const lastBody = Math.abs(toNumber(last.close) - toNumber(last.open));
  if (lastBody < avgBody * 0.5) return null; // ignore very weak last candle

  // Trading rules:
  // - Bullish (CALL): fast EMA crossed above slow EMA (prev fast <= prev slow && fast > slow)
  //   AND RSI not overbought (r < 75)
  // - Bearish (PUT): fast EMA crossed below slow EMA (prev fast >= prev slow && fast < slow)
  //   AND RSI not oversold (r > 25)
  const crossedUp = fastPrev <= slowPrev && fastEma > slowEma;
  const crossedDown = fastPrev >= slowPrev && fastEma < slowEma;

  if (crossedUp && r < 75) return 'CALL';
  if (crossedDown && r > 25) return 'PUT';

  // optional: require at least 2 of last 3 closes in direction
  const recentCloses = closes.slice(-4);
  const upCloses = recentCloses.filter((v, i, arr) => {
    if (i === 0) return false;
    return v > arr[i - 1];
  }).length;
  const downCloses = recentCloses.filter((v, i, arr) => {
    if (i === 0) return false;
    return v < arr[i - 1];
  }).length;

  if (upCloses >= 2 && fastEma > slowEma && r < 80) return 'CALL';
  if (downCloses >= 2 && fastEma < slowEma && r > 20) return 'PUT';

  return null;
}