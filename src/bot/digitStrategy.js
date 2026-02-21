// src/bot/digitStrategy.js

let consecutiveLosses = 0;
let pauseUntil = 0;
const digits = [];

export function createDigitMonitor({ windowSize = 100 } = {}) {
  // This matches the name DerivBot.js is looking for
  return {
    addTick: (quote) => {
      if (!quote) return null;
      const q = Number(quote);
      if (Number.isNaN(q)) return null;

      const digit = Math.floor((q * 100) % 10);
      digits.push(digit);

      if (digits.length > windowSize) {
        digits.shift();
      }
      return digit;
    },
    // Adding the result handler inside the monitor object
    onResult: (result) => {
      if (result === 'win') {
        consecutiveLosses = 0;
      } else if (result === 'loss') {
        consecutiveLosses++;
        if (consecutiveLosses >= 2) {
          pauseUntil = Date.now() + 30000; // 30 seconds pause
          consecutiveLosses = 0;
          console.log('🛑 Two consecutive losses. Pausing for 30 seconds...');
        }
      }
    }
  };
}

export function decideFromMonitor(monitor) {
  // 1. Check if paused
  if (Date.now() < pauseUntil) return null;

  // 2. Ensure data history
  if (digits.length < 50) return null;

  const total = digits.length;
  const c = Array(10).fill(0);
  for (const d of digits) c[d]++;

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
    barrier: barrier
  };
}
