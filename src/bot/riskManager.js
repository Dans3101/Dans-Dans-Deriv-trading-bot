import { SETTINGS } from '../config/deriv.js';

/* ================= STAKE CALCULATION ================= */

export function calculateStake(user) {
  if (!user || !user.currentBalance || user.currentBalance <= 0) {
    return SETTINGS.MIN_STAKE;
  }

  const {
    RISK_PERCENT,
    MAX_STAKE,
    MIN_STAKE,
    MAX_MARTINGALE_STEPS,
    MARTINGALE_MULTIPLIER
  } = SETTINGS;

  /* ===== INITIALIZE BASE STAKE (ONCE) ===== */
  if (user.baseStake === undefined) {
    user.baseStake = Math.max(
      MIN_STAKE,
      Math.min(user.currentBalance * RISK_PERCENT, MAX_STAKE)
    );

    user.martingaleStep = 0;
    user.lastTradeResult = null;
  }

  let stake = user.baseStake;

  /* ===== APPLY MARTINGALE AFTER LOSS ===== */
  if (user.lastTradeResult === 'LOSS') {
    if (user.martingaleStep >= MAX_MARTINGALE_STEPS) {
      console.warn(
        `[${user.userId}] Martingale limit reached — resetting`
      );

      user.martingaleStep = 0;
      stake = user.baseStake;
    } else {
      user.martingaleStep += 1;
      stake =
        user.baseStake *
        Math.pow(MARTINGALE_MULTIPLIER, user.martingaleStep);
    }
  }

  /* ===== RESET AFTER WIN ===== */
  if (user.lastTradeResult === 'WIN') {
    user.martingaleStep = 0;
    stake = user.baseStake;
  }

  /* ===== FINAL SAFETY CAPS ===== */
  stake = Math.min(stake, MAX_STAKE);
  stake = Math.min(stake, user.currentBalance);
  stake = Math.max(stake, MIN_STAKE);

  return Number(stake.toFixed(2));
}

/* ================= TRADING LIMITS ================= */

export function checkLimits(user) {
  if (!user || !user.startBalance) {
    return 'WAITING_FOR_BALANCE';
  }

  const {
    STOP_PROFIT_MULTIPLIER,
    STOP_LOSS_PERCENT,
    MAX_TRADES_PER_DAY
  } = SETTINGS;

  const profitTarget =
    user.startBalance * (1 + STOP_PROFIT_MULTIPLIER);

  const lossLimit =
    user.startBalance * (1 - STOP_LOSS_PERCENT);

  if (user.currentBalance >= profitTarget) {
    return 'PROFIT_TARGET_REACHED';
  }

  if (user.currentBalance <= lossLimit) {
    return 'LOSS_LIMIT_REACHED';
  }

  if (user.tradesToday >= MAX_TRADES_PER_DAY) {
    return 'MAX_TRADES_REACHED';
  }

  return 'OK';
}