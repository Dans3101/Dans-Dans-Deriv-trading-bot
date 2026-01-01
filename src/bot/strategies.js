export function decideTradeDirection(candles) {
  const closes = candles.map(c => c.close);

  const ema10 = closes.slice(-10).reduce((a, b) => a + b) / 10;
  const ema20 = closes.slice(-20).reduce((a, b) => a + b) / 20;

  if (ema10 > ema20) return 'CALL';
  if (ema10 < ema20) return 'PUT';

  return null;
}
