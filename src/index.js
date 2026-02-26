import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg'; 
import { DerivBot } from './bot/DerivBot.js';
import { listenTelegramAdmin } from './notifications/telegramAdmin.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CONFIGURATION ================= */
const APP_ID = process.env.DERIV_APP_ID || "129457"; 
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const MARKUP_PERCENT = 0.001; 

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

export const bots = new Map(); 
let totalVolumeTraded = 0; 

/* ================= BOT BOOT LOGIC ================= */
async function bootBot(userData) {
  if (bots.has(userData.userId)) return;

  try {
    const session = {
      ...userData,
      totalProfit: Number(userData.totalProfit) || 0,
      lifetimeProfit: Number(userData.lifetimeProfit) || 0,
      isRunning: userData.isRunning ?? true
    };

    const bot = new DerivBot(session);
    
    // Prevent server crashes on 403/Forbidden errors
    bot.onConnectionError = (err) => {
        console.error(`⚠️ Connection Error for ${userData.userId}: ${err.message}`);
        bots.delete(userData.userId);
    };

    // Track Markup Volume
    bot.onTradeExecuted = (stake) => {
      totalVolumeTraded += Number(stake);
    };

    bot.connect();
    bots.set(userData.userId, bot);
    console.log(`🚀 Bot Auto-Started for: ${userData.userId}`);
  } catch (error) {
    console.error(`❌ Bot Start Failed:`, error.message);
  }
}

/* ================= UI GENERATORS ================= */

function generateUserTrackingCard(shortId) {
    let activeBot = null;
    bots.forEach((bot, id) => { if (id.endsWith(shortId)) activeBot = bot; });

    if (!activeBot) return `<div style="padding:20px; color:#d91e18;">❌ Bot ID ending in ...${shortId} not found. <br><small>Please connect via Deriv first.</small></div><a href="/" class="btn btn-dark">Back</a>`;

    const u = activeBot.user;
    const isDemo = u.userId.includes('VRTC');
    
    return `
        <div style="text-align:left;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <b style="color:#2c3e50;">ID: ${u.userId}</b>
                <span style="background:${isDemo ? '#fff3e0' : '#e8f5e9'}; color:${isDemo ? '#e67e22' : '#2e7d32'}; padding:3px 10px; border-radius:50px; font-size:11px; font-weight:bold;">
                    ${isDemo ? '🟡 DEMO' : '🟢 REAL'}
                </span>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px;">
                <div style="background:#f8f9fa; padding:12px; border-radius:10px; border:1px solid #eee;">
                    <small style="color:#888;">Live Balance</small><br><b style="font-size:18px;">$${Number(u.currentBalance || 0).toFixed(2)}</b>
                </div>
                <div style="background:#f8f9fa; padding:12px; border-radius:10px; border:1px solid #eee;">
                    <small style="color:#888;">Session Profit</small><br><b style="font-size:18px; color:${u.totalProfit >= 0 ? '#27ae60' : '#d91e18'};">$${Number(u.totalProfit || 0).toFixed(2)}</b>
                </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:15px;">
                <form action="/user/toggle" method="POST">
                    <input type="hidden" name="trackId" value="${shortId}">
                    <button type="submit" style="width:100%; padding:14px; border-radius:12px; border:none; background:${u.isRunning ? '#e67e22' : '#27ae60'}; color:white; font-weight:bold; cursor:pointer;">
                        ${u.isRunning ? '🛑 Stop Trading' : '🚀 Start Trading'}
                    </button>
                </form>
                <a href="https://app.deriv.com/reports/positions" target="_blank" style="text-align:center; padding:12px; background:#2c3e50; color:white; border-radius:12px; text-decoration:none; font-weight:bold; font-size:14px;">📊 View Live on Deriv</a>
                <a href="/" style="text-align:center; padding:10px; color:#999; text-decoration:none; font-size:12px;">✖ Exit Tracking</a>
            </div>
        </div>`;
}

/* ================= WEB ROUTES ================= */

app.get('/', (req, res) => {
  const trackId = req.query.trackId;
  const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=EN&brand=deriv`;

  res.send(`
    <!DOCTYPE html><html><head><title>Dans-Dans AI</title><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; display:flex; flex-direction:column; align-items:center; }
      .container { max-width: 420px; width: 92%; margin-top: 40px; }
      .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); text-align:center; margin-bottom:20px; }
      .btn { display:block; padding:16px; border-radius:12px; text-decoration:none; font-weight:bold; margin-bottom:10px; border:none; cursor:pointer; width:100%; box-sizing:border-box; }
      .btn-red { background: #d91e18; color: white; }
      .btn-dark { background: #2c3e50; color: white; }
    </style>
    </head><body>
      <div class="container">
        <h2 style="color:#2c3e50; margin-bottom:5px;">Dans-Dans AI Bot</h2>
        <p style="font-size:12px; color:#888; margin-bottom:25px;">Digit Strategy v3.1 | App ID: ${APP_ID}</p>
        
        ${trackId ? `<div class="card">${generateUserTrackingCard(trackId)}</div>` : `
          <div class="card">
            <h3 style="margin-top:0;">Launch Bot</h3>
            <p style="color:#666; font-size:14px;">Authorized users earn 0.1% more through our optimized liquidity pool.</p>
            <a href="${authUrl}" class="btn btn-red">Connect Deriv Account</a>
          </div>
          <div class="card">
            <h3>Track Activity</h3>
            <form action="/" method="GET">
                <input type="text" name="trackId" placeholder="Last 4 digits of Account ID" style="width:100%; padding:14px; margin-bottom:10px; border:2px solid #eee; border-radius:10px; box-sizing:border-box; text-align:center; font-size:16px;">
                <button type="submit" class="btn btn-dark">Monitor Bot</button>
            </form>
          </div>
        `}
        <a href="/admin-login" style="color:#ddd; text-decoration:none; font-size:10px;">🛡️ ADMIN</a>
      </div>
    </body></html>`);
});

// AUTO-APPROVE CALLBACK
app.get('/callback', async (req, res) => {
    const { acct1, token1 } = req.query;
    if (!token1) return res.send("Connection failed.");

    const userId = `CR_${acct1}`;
    
    try {
        // Automatically add to DB and set to active
        await pool.query(`
            INSERT INTO users (user_id, api_token, active, is_running) 
            VALUES ($1, $2, true, true) 
            ON CONFLICT (user_id) DO UPDATE SET api_token = $2, active = true, is_running = true`, 
            [userId, token1]
        );

        // Boot the bot immediately
        await bootBot({ userId, apiToken: token1, isRunning: true });

        // Redirect user to their tracking dashboard
        const shortId = acct1.slice(-4);
        res.redirect(`/?trackId=${shortId}`);
    } catch (e) {
        console.error("Callback Error:", e.message);
        res.send("Internal Server Error during linking.");
    }
});

/* ================= STAFF MANAGEMENT ================= */

app.get('/admin-login', (req, res) => {
    res.send(`<body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; background:#f4f7f6;"><div style="background:white; padding:30px; border-radius:20px; text-align:center; box-shadow:0 5px 15px rgba(0,0,0,0.1);"><form action="/admin-portal" method="POST"><h3>Staff Access</h3><input type="password" name="password" placeholder="Admin Code" style="padding:12px; margin-bottom:10px; border:1px solid #ddd; border-radius:8px;"><br><button type="submit" style="padding:10px 20px; background:#2c3e50; color:white; border:none; border-radius:8px; cursor:pointer;">Login</button></form><br><a href="/" style="color:#999; text-decoration:none; font-size:12px;">✖ Exit</a></div></body>`);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Access Denied");
  
  const commission = (totalVolumeTraded * MARKUP_PERCENT).toFixed(2);
  let rows = "";
  bots.forEach((bot, id) => {
    rows += `<tr>
        <td>${id}</td>
        <td>$${Number(bot.user.currentBalance || 0).toFixed(2)}</td>
        <td style="color:${bot.user.totalProfit >= 0 ? 'green' : 'red'}">$${Number(bot.user.totalProfit || 0).toFixed(2)}</td>
        <td>${bot.user.isRunning ? '🟢 Active' : '🟠 Paused'}</td>
        <td>
            <form action="/delete" method="POST" style="margin:0;">
                <input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}">
                <button type="submit" style="background:#ff4757; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">Kill</button>
            </form>
        </td>
    </tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; background:#f4f7f6; padding:20px;">
      <div style="max-width:900px; margin:auto; background:white; padding:30px; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h2 style="margin:0;">🛡️ System Control</h2>
            <a href="/" style="background:#2c3e50; color:white; text-decoration:none; padding:10px 20px; border-radius:10px; font-weight:bold;">Exit to Home</a>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:30px;">
            <div style="background:#e3f2fd; padding:20px; border-radius:15px; border:1px solid #bbdefb; text-align:center;">
                <small style="color:#1565c0;">NETWORK VOLUME</small><br><b style="font-size:24px;">$${totalVolumeTraded.toFixed(2)}</b>
            </div>
            <div style="background:#e8f5e9; padding:20px; border-radius:15px; border:1px solid #c8e6c9; text-align:center;">
                <small style="color:#2e7d32;">EST. MARKUP (0.1%)</small><br><b style="font-size:24px; color:#2e7d32;">$${commission}</b>
            </div>
        </div>
        <table border="1" width="100%" cellpadding="12" style="border-collapse:collapse; background:white;">
            <thead style="background:#f8f9fa;"><tr><th>User ID</th><th>Balance</th><th>Profit</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" style="text-align:center;">No bots currently running</td></tr>'}</tbody>
        </table>
      </div>
    </body>`);
});

app.post('/user/toggle', async (req, res) => {
    const { trackId } = req.body;
    let targetBot = null;
    bots.forEach((bot, id) => { if (id.endsWith(trackId)) targetBot = bot; });

    if (targetBot) {
        targetBot.user.isRunning = !targetBot.user.isRunning;
        await pool.query("UPDATE users SET is_running = $1 WHERE user_id = $2", [targetBot.user.isRunning, targetBot.user.userId]);
        if (!targetBot.user.isRunning) targetBot.stop(); else targetBot.connect();
    }
    res.redirect(`/?trackId=${trackId}`);
});

app.post('/delete', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const bot = bots.get(userId);
    if (bot?.user?.ws) bot.user.ws.terminate();
    bots.delete(userId);
    await pool.query("DELETE FROM users WHERE user_id = $1", [userId]);
  }
  res.redirect(307, '/admin-portal');
});

/* ================= STARTUP ================= */
app.listen(PORT, async () => {
  console.log(`🌐 Server Active: Port ${PORT}`);
  try {
    const result = await pool.query("SELECT * FROM users WHERE active = true");
    result.rows.forEach(u => bootBot({ userId: u.user_id, apiToken: u.api_token, isRunning: u.is_running }));
  } catch (e) { console.error("Database Startup Error"); }
  listenTelegramAdmin(bots);
});
