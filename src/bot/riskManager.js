/**
 * src/bot/riskManager.js
 * Optimized for Digit Over 5 Strategy with Persistence
 */
import fs from 'fs';
import path from 'path';

// Helper to save live progress to the JSON file
function saveUserProgress(userId, totalProfit, tradesToday, multiplier) {
  try {
    const filePath = path.join(process.cwd(), 'users.json');
    if (!fs.existsSync(filePath)) return;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const userIndex = data.users.findIndex(u => u.userId === userId);

    if (userIndex !== -1) {
      // Save the stats and the current Martingale state
      data.users[userIndex].totalProfit = totalProfit;
      data.users[userIndex].tradesToday = tradesToday;
      data.users[userIndex].currentMultiplier = multiplier; 
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error("[PERSISTENCE] Failed to save trade update:", e.message);
  }
}

export function updateStats(user, profit) {
  if (!user) return;
  
  // Initialize stats if empty
  if (typeof user.tradesToday !== 'number') user.tradesToday = 0;
  if (typeof user.totalProfit !== 'number') user.totalProfit = 0;
  if (typeof user.currentMultiplier !== 'number') user.currentMultiplier = 1;

  const tradeProfit = Number(profit);
  user.tradesToday += 1;
  user.totalProfit += tradeProfit;

  // --- MARTINGALE LOGIC ---
  if (tradeProfit < 0) {
    // LOSS: Increase multiplier (2.5x for Over 5)
    user.currentMultiplier *= 2.5; 
  } else {
    // WIN: Reset back to base stake
    user.currentMultiplier = 1;
  }

  // SAVE IMMEDIATELY: This ensures data survives a deploy/restart
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
    const multiplier = user.currentMultiplier || 1;
    
    let base = (user.baseStake && Number(user.baseStake) > 0) 
               ? Number(user.baseStake) 
               : 2.0;

    const rawStake = +(base * multiplier).toFixed(2);

    // Safety: Don't allow a stake higher than 50% of account balance
    const safetyStake = Math.min(rawStake, balance * 0.5);
    return Math.max(0.35, safetyStake);
  } catch (e) {
    return 0.35;
  }
}

export function checkLimits(user = {}) {
  try {
    const balance = Number(user.currentBalance || 0);
    const profit = Number(user.totalProfit || 0);

    if (balance < 0.35) return 'LOW_BALANCE';

    // XML Target Profit ($607)
    if (user.targetProfit && profit >= user.targetProfit) {
        return 'TARGET_REACHED';
    }

    return 'OK';
  } catch (e) {
    return 'ERROR';
  }
}
