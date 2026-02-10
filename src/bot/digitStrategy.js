// src/bot/digitStrategy.js

/**
 * Digit-based Over/Under strategy helper
 *
 * - Keeps last-digit buffer (Math.floor(quote) % 10)
 * - Exposes createDigitMonitor and decideFromMonitor
 * - Defaults tuned:
 *    windowCheckCount = 5
 *    lookbackForLow   = 10
 *    sixPercentThreshold = 14
 */

export function createDigitMonitor({
  windowSize = 60,
  lowDigits = [0, 1, 2, 3, 4, 5, 6],
  triggerDigits = [7, 8, 9]
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
    const c = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    for (const d of buf) {
      if (typeof d === 'number') c[d] = (c[d] || 0) + 1;
    }
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
 * - lookbackForLow: number of previous digits to inspect for the lowDigits repetition
 * - sixPercentThreshold: percent threshold for digits 6,7,8,9 (default 14)
 * - mode: 'OVER'|'UNDER' (default 'OVER') — maps trigger to CALL or PUT
 *
 * Returns 'CALL' | 'PUT' | null
 */
export function decideFromMonitor(monitor, {
  windowCheckCount = 5,
  lookbackForLow = 10,
  sixPercentThreshold = 14,
  mode = 'OVER'
} = {}) {
  try {
    if (!monitor || typeof monitor.size !== 'function') return null;

    const totalSamples = monitor.size();
    if (totalSamples < 6) {
      console.log('[DIGIT DEBUG] insufficient samples', { totalSamples });
      return null;
    }

    const ld = monitor.lastDigit();
    if (ld === null) {
      console.log('[DIGIT DEBUG] last digit null');
      return null;
    }

    const lowDigits = Array.isArray(monitor.lowDigits) ? monitor.lowDigits : [0,1,2,3,4,5,6];
    const triggerDigits = Array.isArray(monitor.triggerDigits) ? monitor.triggerDigits : [7,8,9];

    // 6% rule: digits 6,7,8,9 must each be below threshold percent
    const c = monitor.counts();
    const total = Math.max(1, totalSamples);
    for (const d of [6,7,8,9]) {
      const pct = (c[d] || 0) / total * 100;
      if (pct >= sixPercentThreshold) {
        console.log('[DIGIT DEBUG] abort due to 6% rule', { digit: d, pct, sixPercentThreshold, totalSamples });
        return null; // market biased, bail out
      }
    }

    // Lookback previous samples excluding current last digit
    const lookback = Math.max(1, Math.min(lookbackForLow, totalSamples - 1));
    const prev = monitor.last(lookback + 1).slice(0, lookback);
    const lowCount = prev.filter(d => lowDigits.includes(d)).length;

    const sawEnoughLow = lowCount >= windowCheckCount;
    const isTrigger = triggerDigits.includes(ld);

    const debug = {
      totalSamples,
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
  } catch (e) {
    console.error('[DIGIT DEBUG] error in decideFromMonitor', e?.message || e);
    return null;
  }
}