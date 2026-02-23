// src/bot/digitStrategy.js

let consecutiveLosses = 0;
let pauseUntil = 0;
const digits = [];

export function createDigitMonitor({ windowSize = 50 } = {}) {
  return {
    add: (quote) => {
      const strQuote = quote.toString().replace('.', '');
      const digit = parseInt(strQuote.charAt(strQuote.length - 1));
      
      if (!isNaN(digit)) {
        digits.push(digit);
        if (digits.length > windowSize) digits.shift();
      }
      return digit;
    },
    onResult: (result) => {
      if (result === 'win') {
        consecutiveLosses = 0;
      } else {
        consecutiveLosses++;
        // If we hit 2 losses, the Martingale is getting high. 
        // We pause 30s to let the market "cool down" as per your original file.
        if (consecutiveLosses >= 2) {
          console.log("⚠️ Strategy: 2 losses. Martingale active. Pausing 30s for recovery.");
          pauseUntil = Date.now() + 30000;
          consecutiveLosses = 0;
        }
      }
    }
  };
}

export function decideFromMonitor(monitor) {
  // Guard: Don't trade if paused or not enough data
  if (Date.now() < pauseUntil || digits.length < 15) return null;

  // Analysis: Focus on the last 5 ticks
  const lastFive = digits.slice(-5);
  
  // LOGIC: Count how many digits are 5 or BELOW.
  // In Digit Over 5, these are the "Danger Digits" that would cause a loss.
  const smallDigits = lastFive.filter(d => d <= 5).length;

  /**
   * TRIGGER: If 4 out of the last 5 digits were 0, 1, 2, 3, 4, or 5,
   * it indicates a "Low Trend." Statistical probability suggests a 
   * "High Digit" (6-9) is coming soon.
   */
  if (smallDigits >= 4) {
    console.log(`[STRATEGY] Low Digit Cluster Found (${smallDigits}/5). Prediction: OVER 5`);
    // Return "5" as the barrier for DIGITOVER
    return "5"; 
  }

  return null;
}
