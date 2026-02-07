// src/bot/digitStrategy.js

/**
 * Digit-based Over/Under strategy helper
 *
 * - Uses integer last digit of Math.floor(quote) % 10
 * - Provides a simple monitor and a decision function that returns 'CALL'|'PUT'|null
 */

export function createDigitMonitor({
  windowSize = 60,
  lowDigits = [0,1,2,3,4,5,6],
  triggerDigits = [7,8,9]
} = {}) {
  const buf = [];

  function add(quote) {
    if (quote == null || Number.isNaN(Number(quote))) return null;
    const q = Number(quote);
    const digit = Math.abs(Math.floor(q)) % 10;
    buf.push(digit);
    if (buf.length > windowSize) buf.shift();
    return digit;
  }

  function last(n = 1) {
    if (n <= 0) return [];
    return buf.slice(-n);
  }

  function counts() {
    const c = {0:0,1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
    for (const d of buf) c[d] = (c[d] || 0) + 1;
    return c;
  }

  function size() { return buf.length; }

  function lastDigit() { return buf.length ? buf[buf.length - 1] : null; }

  return {
    add,
    last,
    lastDigit,
    counts,
    size,
    lowDigits,
    triggerDigits
  };
}

/**
 * Decide trade direction from monitor according to the rules:
 * - windowCheckCount: require >= this many occurrences of lowDigits in recent lookback
 * - lookbackForLow: number of previous digits to inspect for the 0-6 repetition
 * - sixPercentThreshold: percent threshold for digits 6,7,8,9 (default 10.3)
 * - mode: 'OVER'|'UNDER' (default 'OVER') — maps trigger to CALL or PUT
 *
 * Returns 'CALL' | 'PUT' | null
 */
export function decideFromMonitor(monitor, {
  windowCheckCount = 4,
  lookbackForLow = 10,
  sixPercentThreshold = 10.3,
  mode = 'OVER'
} = {}) {
  if (!monitor || monitor.size() < 6) return null;

  const ld = monitor.lastDigit();
  if (ld === null) return null;

  // 6% rule: digits 6,7,8,9 must each be below threshold percent
  const c = monitor.counts();
  const total = Math.max(1, monitor.size());
  for (const d of [6,7,8,9]) {
    const pct = (c[d] || 0) / total * 100;
    if (pct >= sixPercentThreshold) {
      // debug
      console.log('[DIGIT DEBUG] abort due to 6% rule', {digit:d, pct, sixPercentThreshold});
      return null; // market biased, bail out
    }
  }

  // check previous values for lowDigits occurrences
  // exclude current last digit: take previous lookbackForLow samples
  const prev = monitor.last(lookbackForLow + 1).slice(0, lookbackForLow);
  const lowCount = prev.filter(d => (monitor.lowDigits || [0,1,2,3,4,5,6]).includes(d)).length;

  const sawEnoughLow = lowCount >= windowCheckCount;
  const isTrigger = (monitor.triggerDigits || [7,8,9]).includes(ld);

  const debug = {
    total,
    counts: c,
    lastDigit: ld,
    prev,
    lowCount,
    sawEnoughLow,
    isTrigger,
    mode,
    windowCheckCount,
    lookbackForLow,
    sixPercentThreshold
  };
  console.log('[DIGIT DEBUG]', JSON.stringify(debug));

  if (sawEnoughLow && isTrigger) {
    if (mode === 'OVER') return 'CALL';
    if (mode === 'UNDER') return 'PUT';
  }

  return null;
}