import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg'; 
import { UserSession } from './users/userSession.js';
import { DerivBot } from './bot/DerivBot.js';
import { listenTelegramAdmin } from './notifications/telegramAdmin.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= DATABASE CONFIG ================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ================= CONFIGURATION ================= */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const PAYMENT_NUMBER = "0713811622"; 
const HELP_LINK = "https://wa.me/message/WW67ZG52UQHOO1"; 
const SUB_PRICE = "100 KSH";

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

export const bots = new Map(); 
const pendingUsers = new Map(); 

/* ================= BOT BOOT LOGIC ================= */
async function bootBot(userData) {
  if (bots.has(userData.userId)) return;
  const apiToken = userData.apiToken?.startsWith('ENV:') ? process.env[userData.apiToken.replace('ENV:', '')] : userData.apiToken;
  if (!apiToken) return;

  const session = {
    ...userData,
    apiToken,
    totalProfit: Number(userData.totalProfit) || 0,
    lifetimeProfit: Number(userData.lifetimeProfit) || 0,
    tradesToday: Number(userData.tradesToday) || 0,
    currentMultiplier: Number(userData.currentMultiplier) || 1,
    isRunning: userData.isRunning ?? true,
    tradeLimit: Number(userData.tradeLimit) || 0
  };

  const bot = new DerivBot(session);
  bot.connect();
  bots.set(userData.userId, bot);
  console.log(`🚀 Bot Instance Active: ${userData.userId}`);
}

/* ================= UI GENERATORS ================= */

function generateUserStats(shortId) {
    let userData = null;
    bots.forEach((bot, id) => { if (id.endsWith(shortId)) { userData = bot; } });

    if (!userData) return `<div style="color:#d91e18; padding:10px; font-weight:bold; text-align:center;">❌ No active bot found for ID ending in "${shortId}".</div>`;

    const sessionProfit = Number(userData.user?.totalProfit || 0).toFixed(2);
    const lifetimeProfit = Number(userData.user?.lifetimeProfit || 0).toFixed(2);
    // Added retrieval of current balance
    const currentBalance = Number(userData.user?.currentBalance || 0).toFixed(2); 
    const isRunning = userData.user.isRunning;

    return `
        <div style="background:#f8f9fa; border-radius:12px; padding:20px; text-align:left; border:1px solid #eee;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h4 style="margin:0; color:#2c3e50;">ID: ...${shortId}</h4>
                <span style="background:${isRunning ? '#e8f5e9' : '#fff3e0'}; color:${isRunning ? '#2e7d32' : '#e67e22'}; padding:4px 10px; border-radius:50px; font-size:11px; font-weight:bold;">
                    ${isRunning ? '● RUNNING' : '○ STOPPED'}
                </span>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:20px;">
                <div><small style="color:#888;">Balance</small><br><b style="font-size:16px; color:#2c3e50;">$${currentBalance}</b></div>
                <div><small style="color:#888;">Session</small><br><b style="font-size:16px; color:#27ae60;">$${sessionProfit}</b></div>
                <div><small style="color:#888;">Lifetime</small><br><b style="font-size:16px; color:#2c3e50;">$${lifetimeProfit}</b></div>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px; border-top: 1px solid #eee; padding-top: 10px;">
                <div><small style="color:#888;">Trades Today</small><br><b style="font-size:16px;">${userData.user.tradesToday}</b></div>
                <div><small style="color:#888;">Trade Limit</small><br><b style="font-size:16px;">${userData.user.tradeLimit || '∞'}</b></div>
            </div>

            <form action="/user/set-limit" method="POST" style="margin-bottom:15px; border-top:1px solid #eee; padding-top:15px;">
                <input type="hidden" name="trackId" value="${shortId}">
                <div style="display:flex; gap:5px; margin-top:5px;">
                    <input type="number" name="limit" value="${userData.user.tradeLimit}" style="margin:0; padding:10px; flex-grow:1; border:1px solid #ddd; border-radius:8px;" placeholder="Trade Limit">
                    <button type="submit" style="background:#2c3e50; color:white; border:none; border-radius:8px; padding:0 15px; cursor:pointer;">Set Limit</button>
                </div>
            </form>

            <div style="display:flex; gap:10px;">
                ${isRunning ? 
                  `<form action="/user/stop" method="POST" style="flex:1;">
                    <input type="hidden" name="trackId" value="${shortId}">
                    <button type="submit" style="background:#e67e22; color:white; border:none; padding:12px; border-radius:10px; cursor:pointer; font-weight:bold; width:100%;">Stop Bot</button>
                   </form>` : 
                  `<form action="/user/start" method="POST" style="flex:1;">
                    <input type="hidden" name="trackId" value="${shortId}">
                    <button type="submit" style="background:#27ae60; color:white; border:none; padding:12px; border-radius:10px; cursor:pointer; font-weight:bold; width:100%;">Reset & Start</button>
                   </form>`
                }
            </div>
            <div style="text-align:center; margin-top:10px;"><a href="/" style="color:#999; font-size:11px; text-decoration:none;">Refresh / Close</a></div>
        </div>`;
}

function generateStaffPerformanceTable() {
  if (bots.size === 0) return '<tr><td colspan="6" style="text-align:center; padding:15px; color:#888;">No active sessions.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const sProfit = Number(bot.user?.totalProfit || 0).toFixed(2);
    const lProfit = Number(bot.user?.lifetimeProfit || 0).toFixed(2);
    const sColor = sProfit >= 0 ? '#27ae60' : '#d91e18';
    rows += `<tr>
        <td><b>${id}</b></td>
        <td>$${Number(bot.user?.currentBalance || 0).toFixed(2)}</td>
        <td style="color:${sColor};">$${sProfit}</td>
        <td style="font-weight:bold;">$${lProfit}</td>
        <td>${bot.user.isRunning ? '<span style="color:#27ae60;">● Live</span>' : '<span style="color:#e67e22;">○ Paused</span>'}</td>
        <td><form action="/delete" method="POST" style="margin:0;"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button type="submit" style="background:#ff4757; color:white; border:none; border-radius:4px; cursor:pointer; padding:5px 10px;">Kill</button></form></td>
    </tr>`;
  });
  return rows;
}

/* ================= WEB ROUTES ================= */

app.get('/', (req, res) => {
  const trackId = req.query.trackId;
  res.send(`
    <!DOCTYPE html><html><head><title>Dans-Dans Trading</title><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>:root { --primary: #d91e18; --dark: #2c3e50; }body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; }.hero { background: var(--dark); color: white; padding: 40px 20px; text-align: center; }.container { max-width: 500px; margin: -40px auto 40px; padding: 0 15px; }.card { background: white; border-radius: 20px; box-shadow: 0 15px 35px rgba(0,0,0,0.1); padding: 30px; text-align:center; margin-bottom:20px;}input { width: 100%; padding: 14px; border: 2px solid #eee; border-radius: 12px; box-sizing: border-box; margin: 10px 0; outline:none; }.btn-connect { background: var(--primary); color: white; border: none; padding: 18px; border-radius: 12px; cursor: pointer; font-weight: bold; width: 100%; font-size: 16px; }.btn-track { background: var(--dark); color: white; border: none; padding: 12px; border-radius: 10px; cursor: pointer; font-weight: bold; width: 100%; }.help-btn { display: block; margin-top: 15px; color: var(--dark); font-weight: bold; text-decoration: none; border: 2px solid #ddd; padding: 12px; border-radius: 12px; }</style>
    </head><body><div class="hero"><h1>Dans-Dans Trading Bot</h1></div><div class="container">
    ${trackId ? `<div class="card" style="border: 2px solid var(--primary);">${generateUserStats(trackId)}</div>` : ''}
    <div class="card"><div style="background:#e8f5e9; color:#2e7d32; padding:5px 15px; border-radius:50px; display:inline-block; font-weight:bold; font-size:12px; margin-bottom:10px;">💰 ${SUB_PRICE} / Week</div>
    <form action="/payment-page" method="POST"><input type="text" name="apiToken" placeholder="Paste Deriv API Token" required><button type="submit" class="btn-connect">Connect & Launch Bot</button></form><p style="font-size:11px; color:#888; margin-top:10px;">How to get token: Deriv Settings > API Token > Check "Read" & "Trade"</p><a href="${HELP_LINK}" class="help-btn" target="_blank">Chat Admin for Help</a></div>
    <div class="card"><h3 style="margin-top:0;">Track My Bot Progress</h3><form action="/" method="GET"><input type="text" name="trackId" placeholder="Enter last 4 digits of ID (e.g. 001)" required><button type="submit" class="btn-track">View My Live Stats</button></form></div>
    <div style="text-align:center;"><a href="/admin-login" style="color:#ccc; text-decoration:none; font-size:11px;">Staff Portal</a></div></div></body></html>`);
});

app.post('/payment-page', (req, res) => {
  const { apiToken } = req.body;
  const tempId = `User_${Math.floor(1000 + Math.random() * 9000)}`;
  pendingUsers.set(tempId, { apiToken });
  
  res.send(`
    <body style="font-family:sans-serif; background:#f4f7f6; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
      <div style="max-width:400px; width:90%; background:white; padding:30px; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.1); text-align:center;">
        <h2 style="color:#2c3e50;">Payment Details</h2>
        <p>Send <b>${SUB_PRICE}</b> to M-Pesa:</p>
        <h1 style="color:#1a1a1a; margin:15px 0;">${PAYMENT_NUMBER}</h1>
        <p style="background:#f8f9fa; padding:10px; border-radius:8px; border:1px dashed #ccc;">Your ID: <b>${tempId}</b></p>
        
        <a href="${HELP_LINK}" style="display:block; background:#2c3e50; color:white; padding:16px; text-decoration:none; border-radius:12px; font-weight:bold; margin-top:20px;">✅ Pay if real account</a>
        
        <div style="margin:25px 0; border-top:1px solid #eee; padding-top:20px;">
          <p style="font-size:13px; color:#777;">Using a virtual/demo account?</p>
          <a href="/" style="display:block; background:#eee; color:#555; padding:12px; text-decoration:none; border-radius:10px; font-weight:bold;">⬅️ Go back if Demo account</a>
        </div>
      </div>
    </body>`);
});

/* ================= USER CONTROL LOGIC ================= */

app.post('/user/stop', async (req, res) => {
    const { trackId } = req.body;
    bots.forEach(async (bot, id) => { 
        if (id.endsWith(trackId)) { 
            bot.stop();
            await pool.query("UPDATE users SET is_running = false WHERE user_id = $1", [id]);
        } 
    });
    res.redirect(`/?trackId=${trackId}`);
});

app.post('/user/start', async (req, res) => {
    const { trackId } = req.body;
    bots.forEach(async (bot, id) => { 
        if (id.endsWith(trackId)) { 
            bot.start(bot.user.tradeLimit);
            await pool.query("UPDATE users SET is_running = true, total_profit = 0, trades_today = 0, current_multiplier = 1 WHERE user_id = $1", [id]);
        } 
    });
    res.redirect(`/?trackId=${trackId}`);
});

app.post('/user/set-limit', async (req, res) => {
    const { trackId, limit } = req.body;
    bots.forEach(async (bot, id) => { 
        if (id.endsWith(trackId)) { 
            bot.user.tradeLimit = Number(limit);
            await pool.query("UPDATE users SET trade_limit = $1 WHERE user_id = $2", [limit, id]);
        } 
    });
    res.redirect(`/?trackId=${trackId}`);
});

/* ================= STAFF PORTAL ================= */

app.get('/admin-login', (req, res) => {
  res.send(`<div style="max-width:300px; margin: 100px auto; text-align:center;"><form action="/admin-portal" method="POST"><input type="password" name="password" placeholder="Admin Password" required><button type="submit">Login</button></form></div>`);
});

app.post('/admin-portal', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.send("Denied.");
  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `<tr><td>${id}</td><td><form action="/manual-activate" method="POST"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button type="submit" style="background:#27ae60; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Approve</button></form></td></tr>`;
  });
  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f4f7f6;">
      <div style="max-width:1100px; margin:auto; background:white; padding:25px; border-radius:15px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:2px solid #eee; padding-bottom:15px;">
            <h1 style="margin:0;">🛡️ Staff Dashboard</h1>
            <a href="/" style="background:#2c3e50; color:white; text-decoration:none; padding:10px 20px; border-radius:8px; font-weight:bold; font-size:14px;">🚪 Exit Dashboard</a>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 3.5fr; gap:25px;">
          <div>
            <h3>Pending</h3>
            <table border="1" width="100%" style="border-collapse:collapse; border:1px solid #ddd;">
                <tr style="background:#eee;"><th>ID</th><th>Action</th></tr>
                ${pendingRows || '<tr><td colspan="2" style="text-align:center; padding:10px;">None</td></tr>'}
            </table>
          </div>
          <div>
            <h3>Performance</h3>
            <table border="1" width="100%" cellpadding="10" style="border-collapse:collapse; border:1px solid #ddd;">
                <thead>
                    <tr style="background:#eee;"><th>ID</th><th>Balance</th><th>Session</th><th>Lifetime</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                    ${generateStaffPerformanceTable()}
                </tbody>
            </table>
          </div>
        </div>
      </div>
    </body>`);
});

app.post('/manual-activate', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    try {
      await pool.query(
        `INSERT INTO users (user_id, api_token, active, total_profit, lifetime_profit, trades_today, current_multiplier, is_running, trade_limit) 
         VALUES ($1, $2, true, 0, 0, 0, 1, true, 0) ON CONFLICT (user_id) DO UPDATE SET active = true`, [userId, data.apiToken]
      );
      await bootBot({ userId, apiToken: data.apiToken, isRunning: true, tradeLimit: 0, lifetimeProfit: 0 });
      pendingUsers.delete(userId);
      res.redirect(307, '/admin-portal');
    } catch (e) { res.status(500).send("DB Error: " + e.message); }
  }
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
  console.log(`🌐 Server Running: Port ${PORT}`);
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lifetime_profit NUMERIC DEFAULT 0`);
    const result = await pool.query("SELECT * FROM users WHERE active = true");
    result.rows.forEach(u => {
      bootBot({
        userId: u.user_id, apiToken: u.api_token, totalProfit: u.total_profit,
        lifetimeProfit: u.lifetime_profit, 
        tradesToday: u.trades_today, currentMultiplier: u.current_multiplier,
        isRunning: u.is_running, tradeLimit: u.trade_limit
      });
    });
  } catch (e) { console.error("DB Startup Error:", e.message); }
  listenTelegramAdmin(bots);
});
