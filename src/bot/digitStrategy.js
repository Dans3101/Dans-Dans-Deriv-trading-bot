let consecutiveLosses = 0;
let pauseUntil = 0;
const digits = [];

export function createDigitMonitor({ windowSize = 100 } = {}) {
  return {
    add: (quote) => {
      // Reliable way to get the last digit of any price string
      const strQuote = quote.toString();
      const digit = parseInt(strQuote.charAt(strQuote.length - 1));
      
      digits.push(digit);
      if (digits.length > windowSize) digits.shift();
      return digit;
    },
    // ... rest of your monitor code ...
  };
}

export function decideFromMonitor(monitor) {
  // REDUCE THIS for testing so you see trades faster
  if (Date.now() < pauseUntil || digits.length < 10) return null; 

  const total = digits.length;
  const counts = Array(10).fill(0);
  digits.forEach(d => counts[d]++);
  const percentages = counts.map(v => (v / total) * 100);

  // LOGIC: Find the most frequent digit to bet AGAINST it (Digit Differs)
  let mostFrequentDigit = 0;
  let highestFreq = 0;

  for (let i = 0; i < 10; i++) {
    if (percentages[i] > highestFreq) {
      highestFreq = percentages[i];
      mostFrequentDigit = i;
    }
  }

  // If a digit appears > 15% of the time, it's a "hot" digit
  if (highestFreq > 15) {
     // We return the digit we want to predict
     return mostFrequentDigit; 
  }

  return null;
}
