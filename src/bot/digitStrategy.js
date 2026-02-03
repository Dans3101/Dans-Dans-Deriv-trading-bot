// src/bot/digitStrategy.js

/**
 * Digit-based Over/Under strategy helper
 *
 * Exports:
 * - createDigitMonitor(opts) -> monitor
 * - decideFromMonitor(monitor, options) -> 'CALL' | 'PUT' | null
 *
 * monitor API:
 * - monitor.add(quote)        // add a new tick quote (number)
 * - monitor.lastDigit         // last digit seen
 * - monitor.lastDigits(n)     // last n digits (array)
 * - monitor.counts()          // object {0: x, 1: y, ...}
 * - monitor.size              // number of samples stored (window)
 *
 * Default behavior tuned to your rules:
 * - windowSize: 60 (last 60 ticks)
 * - requirePrevLowDigitsCount: 4  (0-6 to appear 4+ times)
 * - lowDigitsRange: [0..6]
 * - triggerDigits: [7,8,9]
 * - sixPercentThreshold: 10.3 (percent)
 *
 * NOTE: The digit extraction uses Math.floor(quote) % 10. Change if you want another rule.
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
    // last digit of integer part
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
 *
 * options:
 * - windowCheckCount (default 4): require >= this many occurrences of digits in lowDigits BEFORE seeing a trigger digit
 * - lookbackForLow (default 10): how many previous digits to inspect for the "0-6 repeated" check
 * - sixPercentThreshold (default 10.3) in percent — each of digits 6,7,8,9 must be less than this percent across the monitor window
 * - mode: 'OVER'|'UNDER' (default 'OVER') — choose mapping
 *
 * Returns 'CALL' for OVER or 'PUT' for UNDER, or null.
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

  // 6% rule: check digits 6,7,8,9 frequency across window
  const c = monitor.counts();
  const total = monitor.size() || 1;
  for (const d of [6,7,8,9]) {
    const pct = (c[d] || 0) / total * 100;
    if (pct >= sixPercentThreshold) {
      // market has too much bias in one of these digits, bail out
      return null;
    }
  }

  // check previous values for lowDigits occurrences
  const prev = monitor.last(lookbackForLow + 1).slice(0, lookbackForLow); // exclude last (current)
  const lowCount = prev.filter(d => (monitor.lowDigits || [0,1,2,3,4,5,6]).includes(d)).length;

  const sawEnoughLow = lowCount >= windowCheckCount;
  const isTrigger = (monitor.triggerDigits || [7,8,9]).includes(ld);

  // Basic entry rule: if we saw enough low (0-6) in the recent lookback and now we see a trigger (7/8/9)
  if (sawEnoughLow && isTrigger) {
    // For 'OVER' mode we interpret trigger digits (7/8/9) as CALL (over)
    if (mode === 'OVER') return 'CALL';
    if (mode === 'UNDER') return 'PUT';
  }

  // Additional rule: if we see several trigger digits in a row, optionally trade the opposite?
  // (Not enabled here — keep conservative)
  return null;
}