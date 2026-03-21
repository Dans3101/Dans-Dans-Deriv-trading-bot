/**
 * src/bot/riskManager.js
 * Optimized for Digit Over 5 Strategy with Martingale Recovery
 */

// Track multiplier in memory for the session
let currentMultiplier = 1;

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
  const tradeProfit = Number(profit);
  user.totalProfit += tradeProfit;

  // --- MARTINGALE LOGIC ---
  if (tradeProfit < 0) {
    // LOSS: Increase multiplier to recover (2.5 is ideal for Over 5 payout)
    currentMultiplier *= 2.5; 
    console.log(`[RISK] Loss detected. Increasing multiplier to: ${currentMultiplier}`);
  } else {
    // WIN: Reset back to base stake
    currentMultiplier = 1;
    console.log(`[RISK] Win detected. Resetting multiplier.`);
  }

  console.log(`[STATS UPDATE] ${user.userId}: Trades Today: ${user.tradesToday} | Session Profit: ${user.totalProfit.toFixed(2)}`);
}

/**
 * Calculates the stake based on balance or user preference + Martingale
 */
export function calculateStake(user = {}) {
  try {
    const balance = Number(user.currentBalance || 0);
    
    // 1. Determine the base starting stake
    let base;
    if (user.baseStake && Number(user.baseStake) > 0) {
      base = Number(user.baseStake);
    } else {
      // Fallback: 1% of balance or 0.35 minimum
      base = Math.max(0.35, +(balance * 0.01).toFixed(2));
    }

    // 2. Apply the Martingale multiplier
    const rawStake = +(base * currentMultiplier).toFixed(2);

    // 3. Safety Check: Never stake more than the current balance
    const safetyStake = Math.min(rawStake, balance * 0.5); // Cap at 50% balance per trade

    // 4. Ensure it's not below the Deriv minimum (0.35)
    const finalStake = Math.max(0.35, safetyStake);

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

    // Stop-loss / Max Profit target check
    if (user.targetProfit && user.totalProfit >= user.targetProfit) {
        console.log(`[LIMITS] Target Profit Reached: ${user.totalProfit}`);
        return 'TARGET_REACHED';
    }

    return 'OK';
  } catch (e) {
    console.error('[LIMITS] checkLimits error:', e.message);
    return 'ERROR';
  }
}
