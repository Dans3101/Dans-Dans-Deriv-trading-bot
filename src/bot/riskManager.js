import { SETTINGS } from '../config/deriv.js';

/* ================= STAKE CALCULATION (WITH MARTINGALE) ================= */

export function calculateStake(user) {
  const risk = SETTINGS?.RISK_PERCENT ?? 0.10;
  const maxStake = SETTINGS?.MAX_STAKE ?? 100;

  // Safety guard
  if (!user.currentBalance || user.currentBalance <= 0) {
    return 1;
  }

  // Initialize base stake ONCE
  if (!user.baseStake) {
    user.baseStake = Math.max(
      1,
      Math.min(user.currentBalance * risk, maxStake)
    );
    user.martingaleStep = 0;
  }

  let stake = user.baseStake;

  /* ===== MARTINGALE AFTER LOSS ===== */
  if (user.lastTradeResult === 'LOSS') {
    if (user.martingaleStep >= user.maxMartingaleSteps) {
      console.warn(
        `[${user.userId}] Martingale limit reached (${user.martingaleStep})`
      );
      return 'MARTINGALE_LIMIT_REACHED';
    }

    user.martingaleStep += 1;
    stake = user.baseStake * Math.pow(2, user.martingaleStep);
  }

  /* ===== RESET AFTER WIN ===== */
  if (user.lastTradeResult === 'WIN') {
    user.martingaleStep = 0;
    stake = user.baseStake;
  }

  /* ===== FINAL SAFETY CAPS ===== */
  stake = Math.min(stake, maxStake);
  stake = Math.min(stake, user.currentBalance);
  stake = Math.max(stake, 1);

  return Number(stake.toFixed(2));
}

/* ================= TRADING LIMITS ================= */

export function checkLimits(user) {
  if (!user.startBalance) return 'WAITING_FOR_BALANCE';

  const profitTarget =
    user.startBalance *
    (1 + (SETTINGS?.STOP_PROFIT_MULTIPLIER ?? 2));

  const lossLimit =
    user.startBalance *
    (1 - (SETTINGS?.STOP_LOSS_PERCENT ?? 0.20));

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