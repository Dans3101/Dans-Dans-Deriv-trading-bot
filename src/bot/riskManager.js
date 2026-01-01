import { SETTINGS } from '../config/deriv.js';

export function calculateStake(balance) {
  return balance * SETTINGS.RISK_PERCENT;
}

export function checkLimits(user) {
  const profitTarget =
    user.startBalance * (1 + SETTINGS.STOP_PROFIT_MULTIPLIER);
  const lossLimit =
    user.startBalance * (1 - SETTINGS.STOP_LOSS_PERCENT);

  if (user.currentBalance >= profitTarget) {
    return 'PROFIT_TARGET_REACHED';
  }

  if (user.currentBalance <= lossLimit) {
    return 'LOSS_LIMIT_REACHED';
  }

  if (user.tradesToday >= SETTINGS.MAX_TRADES_PER_DAY) {
    return 'MAX_TRADES_REACHED';
  }

  return 'OK';
}
