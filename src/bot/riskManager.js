/**
 * src/bot/riskManager.js
 * Optimized for Digit Over 5 Strategy with Supabase Persistence
 */
import pg from 'pg';
const { Pool } = pg;

// Connection pool uses the environment variable you added to Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Saves live progress directly to Supabase
 */
async function saveUserProgress(userId, totalProfit, tradesToday, multiplier) {
  try {
    // We use an "UPSERT" (Update or Insert) query
    const query = `
      INSERT INTO users (user_id, total_profit, trades_today, current_multiplier) 
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        total_profit = EXCLUDED.total_profit,
        trades_today = EXCLUDED.trades_today,
        current_multiplier = EXCLUDED.current_multiplier;
    `;
    
    await pool.query(query, [userId, totalProfit, tradesToday, multiplier]);
    console.log(`[DB SAVE] Success for ${userId}`);
  } catch (e) {
    console.error("[DB SAVE ERROR] Persistence failed:", e.message);
  }
}

export async function updateStats(user, profit) {
  if (!user) return;
  
  // Initialize values
  if (typeof user.tradesToday !== 'number') user.tradesToday = 0;
  if (typeof user.totalProfit !== 'number') user.totalProfit = 0;
  if (typeof user.currentMultiplier !== 'number') user.currentMultiplier = 1;

  const tradeProfit = Number(profit);
  user.tradesToday += 1;
  user.totalProfit = Number((user.totalProfit + tradeProfit).toFixed(2));

  // --- MARTINGALE LOGIC ---
  if (tradeProfit < 0) {
    // LOSS: Increase multiplier by 2.5x
    user.currentMultiplier = Number((user.currentMultiplier * 2.5).toFixed(2)); 
  } else {
    // WIN: Reset back to base stake
    user.currentMultiplier = 1;
  }

  // SAVE TO SUPABASE: This ensures data survives a deploy/restart
  await saveUserProgress(
    user.userId, 
    user.totalProfit, 
    user.tradesToday, 
    user.currentMultiplier
  );

  console.log(`[STATS] ${user.userId} | Profit: ${user.totalProfit} | Multiplier: ${user.currentMultiplier}x`);
}

/**
 * STRICT ROUNDING: Ensures Deriv API never sees more than 2 decimal places
 */
export function calculateStake(user = {}) {
  try {
    const balance = Number(user.currentBalance || 0);
    const multiplier = Number(user.currentMultiplier || 1);
    
    let base = (user.baseStake && Number(user.baseStake) > 0) 
               ? Number(user.baseStake) 
               : 2.0;

    // Strict 2-decimal rounding to fix "Invalid Price" errors
    const rawStake = Math.floor(base * multiplier * 100) / 100;

    // Safety: Don't allow a stake higher than 50% of account balance
    const safetyCap = Math.floor(balance * 0.5 * 100) / 100;
    const safetyStake = Math.min(rawStake, safetyCap);
    
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

    if (user.targetProfit && profit >= user.targetProfit) {
        return 'TARGET_REACHED';
    }

    return 'OK';
  } catch (e) {
    return 'ERROR';
  }
}
