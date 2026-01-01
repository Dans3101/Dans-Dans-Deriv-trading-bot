export function calculatePerformanceFee(startBalance, maxBalance) {
  const profit = maxBalance - startBalance;

  if (profit <= 100) {
    return 0;
  }

  const chargeableProfit = profit - 100;
  return chargeableProfit * 0.05;
}