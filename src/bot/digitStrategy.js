// src/bot/digitStrategy.js

export function createDigitMonitor({
  windowSize = 100
} = {}) {

  const digits = [];
  let consecutiveLosses = 0;
  let pauseUntil = 0;

  function add(quote) {
    if (quote == null) return null;

    const q = Number(quote);
    if (Number.isNaN(q)) return null;

    const digit = Math.abs(Math.floor(q)) % 10;

    digits.push(digit);
    if (digits.length > windowSize) {
      digits.shift();
    }

    return digit;
  }

  function counts() {
    const c = Array(10).fill(0);
    for (const d of digits) c[d]++;
    return c;
  }

  function size() {
    return digits.length;
  }

  function isPaused() {
    return Date.now() < pauseUntil;
  }

  function onResult(result) {
    if (result === 'win') {
      consecutiveLosses = 0;
      return;
    }

    if (result === 'loss') {
      consecutiveLosses++;

      if (consecutiveLosses === 1) {
        pauseUntil = Date.now() + 30000; // 30 sec
        console.log('⚠️ 1 LOSS → Pause 30s');
      }

      if (consecutiveLosses >= 2) {
        pauseUntil = Date.now() + 60000; // 60 sec
        consecutiveLosses = 0;
        console.log('🛑 2 LOSSES → Pause 60s');
      }
    }
  }

  return {
    add,
    counts,
    size,
    isPaused,
    onResult,
    digits
  };
}

export function decideFromMonitor(monitor) {

  if (!monitor) return null;
  if (monitor.isPaused()) return null;
  if (monitor.size() < 60) return null; // stronger buffer

  const c = monitor.counts();
  const total = monitor.size();

  const percentages = c.map(v => (v / total) * 100);

  const highDigits = [6, 7, 8, 9];

  let weakestDigit = null;
  let lowestPercent = 100;

  for (const d of highDigits) {
    if (percentages[d] < lowestPercent) {
      lowestPercent = percentages[d];
      weakestDigit = d;
    }
  }

  // only trade if imbalance is strong
  if (lowestPercent > 7) return null;

  const barrier = weakestDigit - 1;

  if (barrier < 0 || barrier > 8) return null;

  return {
    contract_type: "DIGITOVER",
    barrier
  };
}}