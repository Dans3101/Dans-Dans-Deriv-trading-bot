// src/bot/riskManager.js

/**
 * Risk / stake management helpers.
 *
 * Exports:
 *  - calculateStake(user): returns number (stake in USD) or null
 *  - checkLimits(user): returns 'OK' or a string reason (e.g., 'LOW_BALANCE', 'DAILY_LIMIT')
 *
 * This is a conservative, easy-to-tune implementation:
 *  - Default stake is user.baseStake (if set) or 2% of current balance with min 0.2
 *  - checkLimits enforces a minimal balance threshold, and optional per-day trade limit.
 */

export function calculateStake(user = {}) {
  try {
    const balance = Number(user.currentBalance || 0);
    if (!balance || Number.isNaN(balance) || balance <= 0) {
      console.log(`[RISK DEBUG] calculateStake -> no/invalid balance (${balance}) for user ${user.userId}`);
      return null;
    }

    // If a fixed baseStake is set on the user, prefer it (but do a sanity check)
    if (user.baseStake && Number(user.baseStake) > 0) {
      const bs = Number(user.baseStake);
      console.log(`[RISK DEBUG] calculateStake -> using user.baseStake=${bs} for user ${user.userId}`);
      return bs;
    }

    // Otherwise use a percent of balance
    const percent = Number(user.stakePercent) || 0.02; // default 2%
    const raw = Math.max(0.2, +(balance * percent).toFixed(2)); // minimum 0.2 USD
    // optional per-user stake cap
    const cap = user.maxStake ? Number(user.maxStake) : null;
    const stake = cap ? Math.min(raw, cap) : raw;

    console.log(`[RISK DEBUG] calculateStake -> balance=${balance} percent=${percent} stake=${stake} for user ${user.userId}`);
    return stake;
  } catch (e) {
    console.error('[RISK DEBUG] calculateStake error', e?.message || e);
    return null;
  }
}

export function checkLimits(user = {}) {
  try {
    const balance = Number(user.currentBalance || 0);

    // Minimal balance required to trade (default 0.2)
    const minBalance = Number(user.minBalance) || 0.2;
    if (balance < minBalance) {
      console.log(`[LIMITS DEBUG] user=${user.userId} result=LOW_BALANCE balance=${balance} minBalance=${minBalance}`);
      return 'LOW_BALANCE';
    }

    // Optional daily trades limit (if configured)
    const maxPerDay = Number(user.maxTradesPerDay) || null;
    if (maxPerDay && typeof user.tradesToday === 'number' && user.tradesToday >= maxPerDay) {
      console.log(`[LIMITS DEBUG] user=${user.userId} result=DAILY_LIMIT tradesToday=${user.tradesToday} maxPerDay=${maxPerDay}`);
      return 'DAILY_LIMIT';
    }

    // Optional stop-loss / max drawdown guard: don't trade if below allowed drawdown from startBalance/maxBalance
    if (user.startBalance && user.maxBalance) {
      const drawdownPctAllowed = Number(user.drawdownPctAllowed) || 50; // default 50% (very permissive)
      const drawdown = user.startBalance ? ((user.startBalance - balance) / (user.startBalance || 1)) * 100 : 0;
      if (drawdown >= drawdownPctAllowed) {
        console.log(`[LIMITS DEBUG] user=${user.userId} result=DRAWDOWN_EXCEEDED drawdownPct=${drawdown} allowed=${drawdownPctAllowed}`);
        return 'DRAWDOWN_EXCEEDED';
      }
    }

    console.log(`[LIMITS DEBUG] user=${user.userId} result=OK balance=${balance} tradesToday=${user.tradesToday || 0}`);
    return 'OK';
  } catch (e) {
    console.error('[LIMITS DEBUG] checkLimits error', e?.message || e);
    // Fallback: block trading on unexpected error
    return 'ERROR';
  }
}