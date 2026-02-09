// src/bot/digitStrategy.js

export function createDigitMonitor({ windowSize = 60 }) {
  const digits = [];

  return {
    add(price) {
      const digit = Number(price.toString().slice(-1));

      digits.push(digit);

      if (digits.length > windowSize) {
        digits.shift();
      }

      return digit;
    },

    getDigits() {
      return digits;
    }
  };
}


/* ================= STRATEGY ================= */

export function decideFromMonitor(monitor, opts = {}) {
  const {
    mode = 'OVER',
    lookbackForLow = 6,
    sixPercentThreshold = 60
  } = opts;

  const digits = monitor.getDigits();

  if (digits.length < lookbackForLow) return null;

  const recent = digits.slice(-lookbackForLow);

  const lowCount = recent.filter(d => d <= 5).length;
  const highCount = recent.filter(d => d >= 6).length;

  const lowPct = (lowCount / lookbackForLow) * 100;
  const highPct = (highCount / lookbackForLow) * 100;

  if (mode === 'OVER' && lowPct >= sixPercentThreshold) {
    return 'DIGITOVER';
  }

  if (mode === 'UNDER' && highPct >= sixPercentThreshold) {
    return 'DIGITUNDER';
  }

  return null;
}