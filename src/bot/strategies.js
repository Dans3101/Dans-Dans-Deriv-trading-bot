function ema(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];

  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }

  return ema;
}

export function decideTradeDirection(candles) {
  if (candles.length < 20) return null;

  const closes = candles.map(c => Number(c.close));

  const ema10 = ema(closes.slice(-10), 10);
  const ema20 = ema(closes.slice(-20), 20);

  if (ema10 > ema20) return 'CALL';
  if (ema10 < ema20) return 'PUT';

  return null;
}