// src/bot/digitStrategy.js

let consecutiveLosses = 0;
let pauseUntil = 0;
const digits = [];

export function createDigitMonitor({ windowSize = 100 } = {}) {
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
        if (consecutiveLosses >= 2) {
          console.log("⚠️ Strategy: 2 losses. Pausing 30s.");
          pauseUntil = Date.now() + 30000;
          consecutiveLosses = 0;
        }
      }
    }
  };
}

export function decideFromMonitor(monitor) {
  // Guard: Don't trade if paused or not enough data
  if (Date.now() < pauseUntil || digits.length < 20) return null;

  const counts = Array(10).fill(0);
  digits.forEach(d => counts[d]++);
  
  const total = digits.length;
  let mostFrequentDigit = null;
  let highestPercentage = 0;

  for (let i = 0; i < 10; i++) {
    const pct = (counts[i] / total) * 100;
    if (pct > highestPercentage) {
      highestPercentage = pct;
      mostFrequentDigit = i;
    }
  }

  // Trigger: If a digit appears > 18% of the time, bet that the next one WON'T be it
  if (highestPercentage > 18) {
    return mostFrequentDigit;
  }

  return null;
}
