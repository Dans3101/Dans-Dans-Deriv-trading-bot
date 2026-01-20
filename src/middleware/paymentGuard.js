/**
 * Performance fee gate:
 * - DEMO → always allowed
 * - REAL → must pay fee
 */

export function calculatePerformanceFee(startBalance, maxBalance) {
  if (!startBalance || !maxBalance) return 0;

  const profit = maxBalance - startBalance;
  if (profit <= 0) return 0;

  return profit * 0.10; // 10% performance fee
}

export function canTrade(user) {
  // ✅ DEMO accounts trade freely
  if (user.accountType === 'demo') {
    return true;
  }

  // 🔴 REAL account must pay fee
  const fee = calculatePerformanceFee(
    user.startBalance,
    user.maxBalance
  );

  console.log(
    `[${user.userId}] Performance fee due: $${fee.toFixed(2)}`
  );

  if (fee > 0 && !user.performanceFeePaid) {
    console.warn(
      `[${user.userId}] Trading locked: performance fee unpaid`
    );
    return false;
  }

  return true;
}