// src/bot/riskManager.js

/**
 * NEW FUNCTION: Call this after every trade to update the user object
 */
export function updateStats(user, profit) {
  if (!user) return;
  
  // Initialize if they don't exist
  if (typeof user.tradesToday !== 'number') user.tradesToday = 0;
  if (typeof user.totalProfit !== 'number') user.totalProfit = 0;

  // Increment counts
  user.tradesToday += 1;
  user.totalProfit += Number(profit);

  console.log(`[STATS UPDATE] ${user.userId}: Trades Today: ${user.tradesToday} | Session Profit: ${user.totalProfit.toFixed(2)}`);
}

/**
 * Calculates the stake based on balance or user preference
 */
export function calculateStake(user = {}) {
  try {
    const balance = Number(user.currentBalance || 0);
    
    // 1. If a fixed baseStake is set (e.g., 5.0), use it
    if (user.baseStake && Number(user.baseStake) > 0) {
      return Number(user.baseStake);
    }

    // 2. Otherwise use a percentage (default 1% if not set)
    const percent = Number(user.stakePercent) || 0.01; 
    const rawStake = +(balance * percent).toFixed(2);

    // 3. Ensure it's not below the Deriv minimum (0.35)
    const finalStake = Math.max(0.35, rawStake);

    // 4. Optional: Cap the stake if you have a maxStake limit
    if (user.maxStake && finalStake > Number(user.maxStake)) {
      return Number(user.maxStake);
    }

    return finalStake;
  } catch (e) {
    console.error('[RISK] calculateStake error:', e.message);
    return 0.35; // Absolute fallback
  }
}

/**
 * Checks if the bot is allowed to trade based on balance and limits
 */
export function checkLimits(user = {}) {
  try {
    const balance = Number(user.currentBalance || 0);

    // Minimal balance required to trade
    const minBalance = Number(user.minBalance) || 0.35;
    if (balance < minBalance) {
      console.log(`[LIMITS] user=${user.userId} result=LOW_BALANCE balance=${balance}`);
      return 'LOW_BALANCE';
    }

    // Daily trades limit check
    const maxPerDay = Number(user.maxTradesPerDay) || 100; 
    const currentTrades = Number(user.tradesToday) || 0;

    if (currentTrades >= maxPerDay) {
      console.log(`[LIMITS] user=${user.userId} result=DAILY_LIMIT tradesToday=${currentTrades}`);
      return 'DAILY_LIMIT';
    }

    // Stop-loss / Drawdown guard
    if (user.startBalance && user.startBalance > 0) {
      const stopLossAmount = Number(user.stopLoss) || 50; 
      const currentLoss = user.startBalance - balance;
      
      if (currentLoss >= stopLossAmount) {
        console.log(`[LIMITS] user=${user.userId} result=STOP_LOSS_REACHED loss=${currentLoss}`);
        return 'STOP_LOSS_REACHED';
      }
    }

    return 'OK';
  } catch (e) {
    console.error('[LIMITS] checkLimits error:', e.message);
    return 'ERROR';
  }
}
