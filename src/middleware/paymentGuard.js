/**
 * Simple performance-fee gate for your bot
 * (No external dependency on fees.js)
 */

export function calculatePerformanceFee(startBalance, maxBalance) {
  if (!startBalance || !maxBalance) return 0;

  const profit = maxBalance - startBalance;

  if (profit <= 0) return 0;

  // Example: 10% performance fee
  return profit * 0.10;
}

export function canTrade(user) {
  const fee = calculatePerformanceFee(
    user.startBalance,
    user.maxBalance
  );

  // Log for debugging in Render
  console.log(
    `[${user.userId}] Performance fee due: $${fee.toFixed(2)}`
  );

  // If fee is due but not marked paid → block trading
  if (fee > 0 && !user.performanceFeePaid) {
    console.warn(
      `[${user.userId}] Trading locked: performance fee unpaid`
    );
    return false;
  }

  return true;
}