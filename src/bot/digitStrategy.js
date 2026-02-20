// src/bot/digitStrategy.js

export function createDigitStrategy({
  windowSize = 100
} = {}) {

  const digits = [];
  let consecutiveLosses = 0;
  let pauseUntil = 0;

  function addTick(quote) {
    if (!quote) return null;

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
        pauseUntil = Date.now() + 30000; // 30 seconds
        console.log('⚠️ One loss → Pausing 30 seconds');
      }

      if (consecutiveLosses >= 2) {
        pauseUntil = Date.now() + 60000; // 1 minute
        consecutiveLosses = 0; // reset after big pause
        console.log('🛑 Two consecutive losses → Pausing 60 seconds');
      }
    }
  }

  function decide() {
    if (isPaused()) return null;
    if (digits.length < 50) return null;

    const c = counts();
    const total = digits.length;

    const percentages = c.map(v => (v / total) * 100);

    const highDigits = [6, 7, 8, 9];

    let weakestDigit = 6;
    let lowestPercent = 100;

    for (const d of highDigits) {
      if (percentages[d] < lowestPercent) {
        lowestPercent = percentages[d];
        weakestDigit = d;
      }
    }

    const barrier = weakestDigit - 1;

    if (barrier < 0 || barrier > 8) return null;

    return {
      contract_type: "DIGITOVER",
      barrier
    };
  }

  return {
    addTick,
    decide,
    onResult
  };
}