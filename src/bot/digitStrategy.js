// src/bot/digitStrategy.js

let lastTradeTime = 0;
let lossStreak = 0;
let lastEpoch = null;

export function createDigitMonitor({
  windowSize = 200 // bigger sample = better stats
} = {}) {

  const buf = [];

  function add(quote, epoch) {

    // prevent duplicate ticks
    if (epoch === lastEpoch) return null;
    lastEpoch = epoch;

    const q = Number(quote);
    if (!Number.isFinite(q)) return null;

    const digit = Math.abs(Math.floor(q)) % 10;

    buf.push(digit);
    if (buf.length > windowSize) buf.shift();

    return digit;
  }

  function counts() {
    const c = Array(10).fill(0);
    for (const d of buf) c[d]++;
    return c;
  }

  return {
    size: () => buf.length,
    counts,
    lastDigit: () => buf[buf.length - 1]
  };
}


export function decideFromMonitor(monitor, {
  mode = 'OVER'
} = {}) {

  const COOLDOWN = 12000;

  if (!monitor || monitor.size() < 100) return null;

  // cooldown
  if (Date.now() - lastTradeTime < COOLDOWN) return null;

  // loss protection
  if (lossStreak >= 3) return null;

  const counts = monitor.counts();
  const total = monitor.size();

  const overDigits = counts[7] + counts[8] + counts[9];
  const underDigits = total - overDigits;

  const overPct = overDigits / total;
  const underPct = underDigits / total;

  console.log('[DIGIT STATS]', { overPct, underPct });

  // mean reversion edge
  if (overPct > 0.60) {
    lastTradeTime = Date.now();
    return 'PUT'; // too many overs → go under
  }

  if (underPct > 0.60) {
    lastTradeTime = Date.now();
    return 'CALL'; // too many unders → go over
  }

  return null;
}


// call this from bot when trade result known
export function updateDigitResult(win) {
  if (win) lossStreak = 0;
  else lossStreak++;
}