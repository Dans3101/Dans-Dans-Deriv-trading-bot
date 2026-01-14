/**
 * Calculate performance fee based on profit
 * @param {number} initialBalance
 * @param {number} currentBalance
 * @param {number} feePercent
 * @returns {number}
 */
export function calculatePerformanceFee(
  initialBalance,
  currentBalance,
  feePercent = 20
) {
  if (currentBalance <= initialBalance) {
    return 0;
  }

  const profit = currentBalance - initialBalance;
  const fee = (profit * feePercent) / 100;

  return Number(fee.toFixed(2));
}