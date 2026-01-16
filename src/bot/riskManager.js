import { SETTINGS } from '../config/deriv.js';

/**
 * Calculate stake based on risk percentage
 */
export function calculateStake(balance) {
  const risk = SETTINGS?.RISK_PERCENT ?? 0.10; // default 10%

  // Safety guard
  if (!balance || balance <= 0) return 1;

  const stake = balance * risk;

  // Prevent tiny or huge stakes
  return Math.max(1, Math.min(stake, 100));
}

/**
 * Check trading limits
 */
export function checkLimits(user) {
  if (!user.startBalance) return 'WAITING_FOR_BALANCE';

  const profitTarget =
    user.startBalance * (1 + (SETTINGS?.STOP_PROFIT_MULTIPLIER ?? 2)); // default 200%

  const lossLimit =
    user.startBalance * (1 - (SETTINGS?.STOP_LOSS_PERCENT ?? 0.20)); // default 20%

  if (user.currentBalance >= profitTarget) {
    return 'PROFIT_TARGET_REACHED';
  }

  if (user.currentBalance <= lossLimit) {
    return 'LOSS_LIMIT_REACHED';
  }

  if (user.tradesToday >= (SETTINGS?.MAX_TRADES_PER_DAY ?? 20)) {
    return 'MAX_TRADES_REACHED';
  }

  return 'OK';
}