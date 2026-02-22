// src/bot/digitStrategy.js

let consecutiveLosses = 0;
let pauseUntil = 0;
const digits = [];

export function createDigitMonitor({ windowSize = 100 } = {}) {
  return {
    add: (quote) => {
      const digit = Math.floor((Number(quote) * 100) % 10);
      digits.push(digit);
      if (digits.length > windowSize) digits.shift();
      return digit;
    },
    onResult: (res) => {
      if (res === 'win') consecutiveLosses = 0;
      else {
        consecutiveLosses++;
        if (consecutiveLosses >= 2) {
          pauseUntil = Date.now() + 30000; // 30 seconds pause
          consecutiveLosses = 0;
        }
      }
    },
    getStats: () => {
      const total = digits.length || 1;
      const counts = Array(10).fill(0);
      digits.forEach(d => counts[d]++);
      return { percentages: counts.map(v => (v / total) * 100) };
    }
  };
}

/**
 * Decide direction based on digit monitor
 * Returns 'CALL', 'PUT', or null
 */
export function decideFromMonitor(monitor) {
  if (Date.now() < pauseUntil || digits.length < 50) return null;

  const total = digits.length;
  const counts = Array(10).fill(0);
  digits.forEach(d => counts[d]++);

  const percentages = counts.map(v => (v / total) * 100);

  const highGroup = [6, 7, 8, 9];
  const lowGroup = [0, 1, 2, 3];

  let weakestHigh = highGroup[0];
  let lowestHigh = 100;
  highGroup.forEach(d => {
    if (percentages[d] < lowestHigh) { lowestHigh = percentages[d]; weakestHigh = d; }
  });

  let weakestLow = lowGroup[0];
  let lowestLow = 100;
  lowGroup.forEach(d => {
    if (percentages[d] < lowestLow) { lowestLow = percentages[d]; weakestLow = d; lowestLow = percentages[d]; }
  });

  // Example thresholds to decide CALL/PUT
  if (lowestHigh < 9.0) return 'CALL';
  if (lowestLow < 9.0) return 'PUT';

  return null;
}