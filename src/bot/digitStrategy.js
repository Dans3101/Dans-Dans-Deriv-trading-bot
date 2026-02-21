let consecutiveLosses = 0;
let pauseUntil = 0;
const digits = [];

export function createDigitMonitor({ windowSize = 100 } = {}) {
  return {
    add: (quote) => {
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
    
    onResult: (result) => {
      const res = String(result).toLowerCase();
      if (res.includes('win')) {
        consecutiveLosses = 0;
      } else if (res.includes('loss')) {
        consecutiveLosses++;
        if (consecutiveLosses >= 2) {
          pauseUntil = Date.now() + 30000; // 30s Safety Pause
          consecutiveLosses = 0; 
          console.log('🛑 [Strategy] 2 Losses: Cooling down for 30s');
        }
      }
    },

    // Used by the Live Digit Graph in index.js
    getStats: () => {
      const total = digits.length || 1;
      const counts = Array(10).fill(0);
      digits.forEach(d => counts[d]++);
      return {
        percentages: counts.map(v => parseFloat(((v / total) * 100).toFixed(1))),
        count: total
      };
    }
  };
}

export function decideFromMonitor(monitor) {
  if (Date.now() < pauseUntil) return null;
  if (digits.length < 50) return null;

  const total = digits.length;
  const counts = Array(10).fill(0);
  for (const d of digits) counts[d]++;

  const percentages = counts.map(v => (v / total) * 100);

  // ANALYSIS: Find the coldest digit among high numbers (6,7,8,9)
  const targetGroup = [6, 7, 8, 9];
  let weakestDigit = 6;
  let lowestPercent = 100;

  for (const d of targetGroup) {
    if (percentages[d] < lowestPercent) {
      lowestPercent = percentages[d];
      weakestDigit = d;
    }
  }

  /* HARDENING FILTERS */
  // 1. Only trade if the weakest digit is truly 'cold' (below 9%)
  if (lowestPercent > 9.0) return null;

  // 2. Trend Guard: Don't enter if the last digit was a 0 or 1
  const lastDigit = digits[digits.length - 1];
  if (lastDigit <= 1) return null;

  const barrier = weakestDigit - 1;
  
  if (barrier < 0 || barrier > 8) return null;

  return "DIGITOVER"; 
}
