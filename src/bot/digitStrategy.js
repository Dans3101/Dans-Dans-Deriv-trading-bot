// src/bot/digitStrategy.js

export function createDigitMonitor({
  windowSize = 120
} = {}) {
  const buf = [];

  function add(quote) {
    if (quote == null || Number.isNaN(Number(quote))) return null;
    const digit = Math.abs(Math.floor(Number(quote))) % 10;
    buf.push(digit);
    if (buf.length > windowSize) buf.shift();
    return digit;
  }

  function last(n = 1) {
    return buf.slice(-n);
  }

  function counts() {
    const c = Array(10).fill(0);
    for (const d of buf) c[d]++;
    return c;
  }

  function size() {
    return buf.length;
  }

  function lastDigit() {
    return buf.length ? buf[buf.length - 1] : null;
  }

  return { add, last, counts, size, lastDigit };
}

export function decideFromMonitor(monitor) {
  if (!monitor || monitor.size() < 30) return null;

  const counts = monitor.counts();
  const total = monitor.size();
  const last3 = monitor.last(3);
  const lastDigit = monitor.lastDigit();

  if (last3.length < 3) return null;

  const highDigits = [7,8,9];
  const lowDigits = [0,1,2,3,4,5,6];

  const highCount = highDigits.reduce((a,d)=>a+counts[d],0);
  const lowCount = lowDigits.reduce((a,d)=>a+counts[d],0);

  const highPct = highCount / total;
  const lowPct = lowCount / total;

  const isSameStreak =
    last3[0] === last3[1] &&
    last3[1] === last3[2];

  const isHighStreak =
    highDigits.includes(last3[0]) &&
    highDigits.includes(last3[1]) &&
    highDigits.includes(last3[2]);

  const isLowStreak =
    lowDigits.includes(last3[0]) &&
    lowDigits.includes(last3[1]) &&
    lowDigits.includes(last3[2]);

  // 🔥 AGGRESSIVE RULES

  // Case 1: High streak exhaustion → trade UNDER
  if (isHighStreak && highPct > 0.35) {
    console.log('[AGGRESSIVE] High streak exhaustion → PUT');
    return 'PUT'; // Digit Under
  }

  // Case 2: Low streak exhaustion → trade OVER
  if (isLowStreak && lowPct > 0.55) {
    console.log('[AGGRESSIVE] Low streak exhaustion → CALL');
    return 'CALL'; // Digit Over
  }

  // Case 3: Same digit 3x → reversal
  if (isSameStreak) {
    if (lastDigit >= 5) {
      console.log('[AGGRESSIVE] Same high digit streak → PUT');
      return 'PUT';
    } else {
      console.log('[AGGRESSIVE] Same low digit streak → CALL');
      return 'CALL';
    }
  }

  return null;
}