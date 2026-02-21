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
          pauseUntil = Date.now() + 30000;
          consecutiveLosses = 0;
        }
      }
    },
    getStats: () => {
      const total = digits.length || 1;
      const counts = Array(10).fill(0);
      digits.forEach(d => counts[d]++);
      return { percentages: counts.map(v => (v/total)*100) };
    }
  };
}

export function decideFromMonitor(monitor) {
  if (Date.now() < pauseUntil || digits.length < 50) return null;
  const total = digits.length;
  const counts = Array(10).fill(0);
  digits.forEach(d => counts[d]++);
  
  const percentages = counts.map(v => (v / total) * 100);
  const targetGroup = [6, 7, 8, 9];
  let weakest = 6;
  let low = 100;

  targetGroup.forEach(d => {
    if (percentages[d] < low) { low = percentages[d]; weakest = d; }
  });

  if (low > 9.0 || digits[digits.length - 1] <= 1) return null;
  return "DIGITOVER"; 
}
