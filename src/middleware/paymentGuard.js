/**
 * Performance fee gate:
 * - DEMO → always allowed
 * - REAL → must pay fee after profit
 */

export function calculatePerformanceFee(startBalance, maxBalance) {
  if (!startBalance || !maxBalance) return 0;

  const profit = maxBalance - startBalance;
  if (profit <= 0) return 0;

  return profit * 0.10; // 10% performance fee
}

export function canTrade(user) {
  // ✅ DEFAULT TO DEMO IF NOT SET
  const accountType = user.accountType || 'demo';

  // ✅ DEMO accounts always trade
  if (accountType === 'demo') {
    return true;
  }

  // ⏳ Allow trading until balances are initialized
  if (!user.startBalance || !user.maxBalance) {
    return true;
  }

  // 🔴 REAL account fee enforcement
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