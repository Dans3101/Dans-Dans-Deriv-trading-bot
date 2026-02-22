// ... existing calculateStake code ...

export function checkLimits(user = {}) {
  try {
    const balance = Number(user.currentBalance || 0);

    // Minimal balance required to trade
    const minBalance = Number(user.minBalance) || 0.2;
    if (balance < minBalance) {
      console.log(`[LIMITS DEBUG] user=${user.userId} result=LOW_BALANCE balance=${balance}`);
      return 'LOW_BALANCE';
    }

    // Daily trades limit check
    const maxPerDay = Number(user.maxTradesPerDay) || 100; // Default to 100 if not set
    const currentTrades = Number(user.tradesToday) || 0;

    if (currentTrades >= maxPerDay) {
      console.log(`[LIMITS DEBUG] user=${user.userId} result=DAILY_LIMIT tradesToday=${currentTrades} maxPerDay=${maxPerDay}`);
      return 'DAILY_LIMIT';
    }

    // Stop-loss / Drawdown guard
    if (user.startBalance && user.startBalance > 0) {
      const stopLossAmount = Number(user.stopLoss) || 50; // USD amount
      const currentLoss = user.startBalance - balance;
      
      if (currentLoss >= stopLossAmount) {
        console.log(`[LIMITS DEBUG] user=${user.userId} result=STOP_LOSS_REACHED loss=${currentLoss}`);
        return 'STOP_LOSS_REACHED';
      }
    }

    console.log(`[LIMITS DEBUG] user=${user.userId} result=OK balance=${balance} tradesToday=${currentTrades}`);
    return 'OK';
  } catch (e) {
    console.error('[LIMITS DEBUG] checkLimits error', e?.message || e);
    return 'ERROR';
  }
}

/**
 * NEW FUNCTION: Call this after every trade to update the user object
 */
export function updateStats(user, profit) {
  if (!user) return;
  
  // Initialize if they don't exist
  if (typeof user.tradesToday !== 'number') user.tradesToday = 0;
  if (typeof user.totalProfit !== 'number') user.totalProfit = 0;

  // Increment
  user.tradesToday += 1;
  user.totalProfit += Number(profit);

  console.log(`[STATS UPDATE] ${user.userId}: Trades Today: ${user.tradesToday} | Session Profit: ${user.totalProfit.toFixed(2)}`);
}
