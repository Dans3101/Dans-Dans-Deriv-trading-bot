// src/bot/digitStrategy.js

let consecutiveLosses = 0;
let pauseUntil = 0;
const digits = [];

export function createDigitMonitor({ windowSize = 100 } = {}) {
  return {
    // Renamed from addTick to add to match your DerivBot.js call
    add: (quote) => {
      if (!quote) return null;
      const q = Number(quote);
      if (Number.isNaN(q)) return null;

      // Extract last digit
      const digit = Math.floor((q * 100) % 10);
      digits.push(digit);

      if (digits.length > windowSize) {
        digits.shift();
      }
      return digit;
    },
    
    // Result handler for the 2-loss pause logic
    onResult: (result) => {
      if (result === 'win' || result === 'won') {
        consecutiveLosses = 0;
      } else if (result === 'loss' || result === 'lost') {
        consecutiveLosses++;
        console.log(`[Strategy] Consecutive Losses: ${consecutiveLosses}`);

        if (consecutiveLosses >= 2) {
          pauseUntil = Date.now() + 30000; // 30 seconds pause
          consecutiveLosses = 0; // Reset counter
          console.log('🛑 2 Losses: Strategy pausing for 30s');
        }
      }
    }
  };
}

export function decideFromMonitor(monitor) {
  // 1. Check if the 30-second pause is active
  if (Date.now() < pauseUntil) {
    return null;
  }

  // 2. Ensure we have enough data (50 ticks)
  if (digits.length < 50) {
    return null;
  }

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
