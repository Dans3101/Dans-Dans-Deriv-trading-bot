/**
 * SMART TREND STRATEGY (Upgraded)
 *
 * Improvements:
 * - Slower EMA crossover (5/15) → less noise
 * - RSI confirmation tighter
 * - Volatility filter (body strength)
 * - Cooldown between trades
 * - No random fallback entries
 * - Much fewer but higher quality trades
 *
 * Returns 'CALL', 'PUT', or null
 */

let lastTradeTime = 0;
const COOLDOWN_MS = 90 * 1000; // 90 seconds between trades

function now() {
  return Date.now();
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function sma(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function ema(values, period) {
  if (values.length < period) return NaN;

  const k = 2 / (period + 1);
  let emaVal = sma(values.slice(0, period));

  for (let i = period; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
  }

  return emaVal;
}

function rsi(values, period = 14) {
  if (values.length < period + 1) return NaN;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

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

export function decideTradeDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 40) return null;

  // cooldown (prevents overtrading)
  if (now() - lastTradeTime < COOLDOWN_MS) return null;

  const window = candles.slice(-40);

  const closes = window.map(c => toNumber(c.close));
  const bodies = window.map(c =>
    Math.abs(toNumber(c.close) - toNumber(c.open))
  );

  if (closes.some(isNaN) || bodies.some(isNaN)) return null;

  // ===== Volatility filter =====
  const avgBody = sma(bodies.slice(-15));
  const lastBody = bodies[bodies.length - 1];

  if (lastBody < avgBody * 0.8) return null;

  // ===== Indicators =====
  const fast = ema(closes, 5);
  const slow = ema(closes, 15);

  const prevFast = ema(closes.slice(0, -1), 5);
  const prevSlow = ema(closes.slice(0, -1), 15);

  const r = rsi(closes, 14);

  if (!Number.isFinite(fast) || !Number.isFinite(slow) || !Number.isFinite(r))
    return null;

  const crossedUp = prevFast <= prevSlow && fast > slow;
  const crossedDown = prevFast >= prevSlow && fast < slow;

  // ===== Trade logic (stricter) =====
  if (crossedUp && r > 45 && r < 70) {
    lastTradeTime = now();
    return 'CALL';
  }

  if (crossedDown && r < 55 && r > 30) {
    lastTradeTime = now();
    return 'PUT';
  }

  return null;
}