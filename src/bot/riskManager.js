/**
 * src/bot/riskManager.js
 * Optimized for Digit Over 5 Strategy with Persistence & Strict Rounding
 */
import fs from 'fs';
import path from 'path';

// Render Persistent Disk path detection
const usersFilePath = process.env.RENDER ? '/data/users.json' : path.join(process.cwd(), 'users.json');

// Helper to save live progress to the JSON file
function saveUserProgress(userId, totalProfit, tradesToday, multiplier) {
  try {
    if (!fs.existsSync(usersFilePath)) return;

    const data = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    const userIndex = data.users.findIndex(u => u.userId === userId);

    if (userIndex !== -1) {
      // Save stats and strict round the multiplier to 2 decimal places
      data.users[userIndex].totalProfit = Number(totalProfit.toFixed(2));
      data.users[userIndex].tradesToday = tradesToday;
      data.users[userIndex].currentMultiplier = Number(multiplier.toFixed(2)); 
      
      fs.writeFileSync(usersFilePath, JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error("[PERSISTENCE] Failed to save trade update:", e.message);
  }
}

export function updateStats(user, profit) {
  if (!user) return;
  
  if (typeof user.tradesToday !== 'number') user.tradesToday = 0;
  if (typeof user.totalProfit !== 'number') user.totalProfit = 0;
  if (typeof user.currentMultiplier !== 'number') user.currentMultiplier = 1;

  const tradeProfit = Number(profit);
  user.tradesToday += 1;
  user.totalProfit += tradeProfit;

  if (tradeProfit < 0) {
    // LOSS: Increase multiplier
    user.currentMultiplier *= 2.5; 
  } else {
    // WIN: Reset
    user.currentMultiplier = 1;
  }

  // Round multiplier before saving to prevent 3.105 issues
  user.currentMultiplier = Number(user.currentMultiplier.toFixed(2));

  saveUserProgress(
    user.userId, 
    user.totalProfit, 
    user.tradesToday, 
    user.currentMultiplier
  );

  console.log(`[STATS] ${user.userId} | Profit: ${user.totalProfit.toFixed(2)} | Next Multiplier: ${user.currentMultiplier}x`);
}

export function calculateStake(user = {}) {
  try {
    const balance = Number(user.currentBalance || 0);
    const multiplier = Number(user.currentMultiplier || 1);
    
    // Set base stake (XML standard is 2.0 or 0.35)
    let base = (user.baseStake && Number(user.baseStake) > 0) 
               ? Number(user.baseStake) 
               : 2.0;

    // STRICT ROUNDING: Math.round ensures no floating point drift like 3.105
    const rawStake = Math.round(base * multiplier * 100) / 100;

    // Safety: Don't allow a stake higher than 50% of account balance
    // Also round the safety cap to 2 decimal places
    const safetyCap = Math.round(balance * 0.5 * 100) / 100;
    const safetyStake = Math.min(rawStake, safetyCap);
    
    // Final stake check against Deriv's absolute minimum
    const finalStake = Math.max(0.35, safetyStake);
    
    return Number(finalStake.toFixed(2));
  } catch (e) {
    console.error('[RISK] calculateStake error:', e.message);
    return 0.35;
  }
}

export function checkLimits(user = {}) {
  try {
    const balance = Number(user.currentBalance || 0);
    const profit = Number(user.totalProfit || 0);

    if (balance < 0.35) return 'LOW_BALANCE';

    // Target Profit logic
    if (user.targetProfit && profit >= user.targetProfit) {
        return 'TARGET_REACHED';
    }

    return 'OK';
  } catch (e) {
    return 'ERROR';
  }
}
