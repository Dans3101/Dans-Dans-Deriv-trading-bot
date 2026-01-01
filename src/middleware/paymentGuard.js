import { calculatePerformanceFee } from '../payments/fees.js';

export function canTrade(user) {
  const fee = calculatePerformanceFee(
    user.startBalance,
    user.maxBalance
  );

  if (fee > 0 && !user.performanceFeePaid) {
    return false;
  }

  return true;
}