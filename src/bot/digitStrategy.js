// Global tracking for the hardening logic
let consecutiveLosses = 0;
let pauseUntil = 0;
const digits = [];

export function createDigitMonitor({ windowSize = 100 } = {}) {
  return {
    add: (quote) => {
      if (!quote) return null;
      const q = Number(quote);
      if (Number.isNaN(q)) return null;

      // Extract last digit accurately
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
          pauseUntil = Date.now() + 30000; // 30s pause after 2 losses
          consecutiveLosses = 0; 
          console.log('🛑 [Guard] 2 Losses detected: Strategy cooling down for 30s');
        }
      }
    }
  };
}

export function decideFromMonitor(monitor, config = {}) {
  // 1. Safety Guard: Pause during cooldown
  if (Date.now() < pauseUntil) return null;

  // 2. Data Guard: Require 60 ticks for a more stable statistical sample
  if (digits.length < 60) return null;

  // 3. Volatility Guard: Avoid "Stagnant" markets
  // If the last 3 digits are the same, the market is too stable for digit volatility
  const last3 = digits.slice(-3);
  if (last3.length === 3 && last3[0] === last3[1] && last3[1] === last3[2]) {
    return null;
  }

  // 4. Frequency Analysis
  const total = digits.length;
  const countMap = Array(10).fill(0);
  for (const d of digits) countMap[d]++;

  const percentages = countMap.map(v => (v / total) * 100);

  /* UPGRADED LOGIC: "The Cold Spike Filter"
     Instead of just finding the weakest, we ensure the weakest digit 
     is below a 'Probability Threshold' (less than 8%).
  */
  const highDigits = [6, 7, 8, 9];
  let weakestDigit = -1;
  let lowestPercent = 100;

  for (const d of highDigits) {
    if (percentages[d] < lowestPercent) {
      lowestPercent = percentages[d];
      weakestDigit = d;
    }
  }

  // ACCURACY FILTER: Only trade if the weakest digit is truly 'cold' (below 9%)
  if (lowestPercent > 9.0) return null;

  // 5. Pattern Confirmation (The "Last Tick" Rule)
  // We only trade DIGITOVER if the very last digit was NOT a loss-maker (0, 1, or 2)
  // This ensures we aren't catching a falling knife.
  const lastDigit = digits[digits.length - 1];
  if (lastDigit <= 1) return null; 

  // 6. Final Decision
  // We target OVER [Weakest Digit - 1]
  const barrier = weakestDigit - 1;
  
  // Final bounds safety check
  if (barrier < 0 || barrier > 8) return null;

  console.log(`🎯 [Strategy] Entry Confirmed! Weakest: ${weakestDigit} (${lowestPercent.toFixed(1)}%). Trading Over ${barrier}`);

  return "DIGITOVER"; // Return the contract type string as expected by DerivBot.js
}
