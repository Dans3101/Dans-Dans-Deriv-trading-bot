// src/bot/digitStrategy.js

export function createDigitStrategy({
  windowSize = 100
} = {}) {

  const digits = [];
  let consecutiveLosses = 0;
  let pauseUntil = 0;

  function addTick(quote) {
    if (!quote) return null;

    const q = Number(quote);
    if (Number.isNaN(q)) return null;

    // Get the last digit of the price
    const digit = Math.floor((q * 100) % 10); 
    digits.push(digit);

    if (digits.length > windowSize) {
      digits.shift();
    }

    return digit;
  }

  function counts() {
    const c = Array(10).fill(0);
    for (const d of digits) c[d]++;
    return c;
  }

  function isPaused() {
    return Date.now() < pauseUntil;
  }

  function onResult(result) {
    if (result === 'win') {
      // Reset counter on any win
      consecutiveLosses = 0;
      return;
    }

    if (result === 'loss') {
      consecutiveLosses++;
      console.log(`Current consecutive losses: ${consecutiveLosses}`);

      // When it loses exactly twice
      if (consecutiveLosses >= 2) {
        pauseUntil = Date.now() + 30000; // 30 seconds pause
        consecutiveLosses = 0; // Reset counter so it can try again after the pause
        console.log('🛑 Two losses reached. Pausing for 30 seconds...');
      }
    }
  }

  function decide() {
    // 1. Check if we are currently in the 30-second cooldown
    if (isPaused()) return null;

    // 2. Ensure we have enough data to make a statistical decision
    if (digits.length < 50) return null;

    const c = counts();
    const total = digits.length;
    const percentages = c.map(v => (v / total) * 100);

    // Looking for the "Digit Over" opportunity
    const highDigits = [6, 7, 8, 9];
    let weakestDigit = 6;
    let lowestPercent = 100;

    for (const d of highDigits) {
      if (percentages[d] < lowestPercent) {
        lowestPercent = percentages[d];
        weakestDigit = d;
      }
    }

    // Setting the barrier (Prediction)
    // If weakestDigit is 6, barrier is 5 (Digit Over 5)
    const barrier = weakestDigit - 1;

    if (barrier < 0 || barrier > 8) return null;

    return {
      contract_type: "DIGITOVER",
      barrier: barrier // This acts as the 'Prediction' in the API
    };
  }

  return {
    addTick,
    decide,
    onResult
  };
}
