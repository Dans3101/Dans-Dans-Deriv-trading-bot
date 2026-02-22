// src/bot/digitStrategy.js

let consecutiveLosses = 0;
let pauseUntil = 0;
const digits = [];

/**
 * Digit Monitor Factory
 * Tracks the history of digits and handles win/loss logic
 */
export function createDigitMonitor({ windowSize = 100 } = {}) {
  return {
    // Correctly extracts the last digit from the price
    add: (quote) => {
      const strQuote = parseFloat(quote).toString();
      // Removes decimal point if present and grabs the last character
      const cleanQuote = strQuote.replace('.', '');
      const digit = parseInt(cleanQuote.charAt(cleanQuote.length - 1));
      
      if (!isNaN(digit)) {
        digits.push(digit);
        if (digits.length > windowSize) digits.shift();
      }
      return digit;
    },

    // Handles the logic for pausing if the bot loses too many times
    onResult: (res) => {
      const result = res.toLowerCase();
      if (result === 'win') {
        consecutiveLosses = 0;
      } else if (result === 'loss') {
        consecutiveLosses++;
        // If we lose 2 times in a row, pause for 30 seconds
        if (consecutiveLosses >= 2) {
          console.log("⚠️ Strategy: 2 consecutive losses detected. Pausing for 30s...");
          pauseUntil = Date.now() + 30000; 
          consecutiveLosses = 0;
        }
      }
    },

    getStats: () => {
      const total = digits.length || 1;
      const counts = Array(10).fill(0);
      digits.forEach(d => counts[d]++);
      return { 
        percentages: counts.map(v => (v / total) * 100),
        count: digits.length 
      };
    }
  };
}

/**
 * Strategy Logic: Digit Differs
 * Looks for the most frequent digit to bet AGAINST it.
 * Returns the digit (0-9) to predict, or null if no trade.
 */
export function decideFromMonitor(monitor) {
  // 1. Guard Clauses (Pause or insufficient data)
  if (Date.now() < pauseUntil) return null;
  if (digits.length < 15) return null; // Wait for at least 15 ticks to establish a pattern

  const total = digits.length;
  const counts = Array(10).fill(0);
  digits.forEach(d => counts[d]++);

  // Calculate percentages for each digit 0-9
  const percentages = counts.map(v => (v / total) * 100);

  let mostFrequentDigit = 0;
  let highestFreq = 0;

  // Find which digit is appearing most often
  for (let i = 0; i < 10; i++) {
    if (percentages[i] > highestFreq) {
      highestFreq = percentages[i];
      mostFrequentDigit = i;
    }
  }

  /**
   * DECISION RULE:
   * If a digit appears > 18% of the time (statistically high), 
   * we predict that the NEXT digit will DIFF (be different) from it.
   */
  if (highestFreq > 18) {
    console.log(`[Strategy] Hot Digit Found: ${mostFrequentDigit} (${highestFreq.toFixed(1)}%)`);
    return mostFrequentDigit; 
  }

  return null;
}
