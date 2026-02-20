/**
 * DollarPrinter Style Digit Strategy (Node.js Version)
 *
 * - Fixed stake
 * - Stops after 2 consecutive losses
 * - No martingale
 * - Aggressive trigger logic
 * - Designed for DIGIT OVER strategy
 */

export function createDigitMonitor({
  windowSize = 20
} = {}) {

  const digits = [];
  let consecutiveLosses = 0;
  let stopped = false;

  function add(quote) {
    if (quote == null || Number.isNaN(Number(quote))) return null;

    const digit = Math.abs(Math.floor(Number(quote))) % 10;

    digits.push(digit);
    if (digits.length > windowSize) digits.shift();

    return digit;
  }

  function last(n = 1) {
    return digits.slice(-n);
  }

  function size() {
    return digits.length;
  }

  function lastDigit() {
    return digits.length ? digits[digits.length - 1] : null;
  }

  function recordResult(isWin) {
    if (isWin) {
      consecutiveLosses = 0;
    } else {
      consecutiveLosses++;
      if (consecutiveLosses >= 2) {
        stopped = true;
        console.log('🛑 Strategy stopped after 2 consecutive losses.');
      }
    }
  }

  function isStopped() {
    return stopped;
  }

  function reset() {
    consecutiveLosses = 0;
    stopped = false;
  }

  return {
    add,
    last,
    size,
    lastDigit,
    recordResult,
    isStopped,
    reset
  };
}


/**
 * Aggressive DollarPrinter Digit Logic
 *
 * Rules:
 * - If last 3 digits are LOW (0-4)
 * - And current digit is HIGH (7,8,9)
 * - Trade DIGIT OVER 6 (CALL)
 *
 * Returns:
 * 'CALL' | null
 */

export function decideFromMonitor(monitor) {

  if (!monitor || monitor.isStopped()) {
    return null;
  }

  if (monitor.size() < 4) return null;

  const lastDigits = monitor.last(4);
  const previousThree = lastDigits.slice(0, 3);
  const current = lastDigits[3];

  const lowDigits = [0,1,2,3,4];
  const highDigits = [7,8,9];

  const lowCount = previousThree.filter(d => lowDigits.includes(d)).length;

  const debug = {
    previousThree,
    current,
    lowCount
  };

  console.log('[DOLLARPRINTER DEBUG]', JSON.stringify(debug));

  // Aggressive trigger condition
  if (lowCount >= 2 && highDigits.includes(current)) {
    console.log('🚀 SIGNAL: DIGIT OVER');
    return 'CALL';   // Use with DIGITOVER contract
  }

  return null;
}