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
// Uses the variable you set in Render, or defaults to your ID
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
const pendingUsers = new Map(); 
let totalVolumeTraded = 0; 

/* ================= SAFETY BOOT LOGIC ================= */
async function bootBot(userData) {
  if (bots.has(userData.userId)) return;

  try {
    const session = {
      ...userData,
      totalProfit: Number(userData.totalProfit) || 0,
      lifetimeProfit: Number(userData.lifetimeProfit) || 0,
      isRunning: userData.isRunning ?? true,
      appId: APP_ID // Pass the App ID to the bot instance
    };

    const bot = new DerivBot(session);
    
    // Safety: prevent the server from crashing if a single bot connection fails (403 error)
    bot.onConnectionError = (err) => {
        console.error(`⚠️ Connection rejected for ${userData.userId}: ${err.message}`);
        bots.delete(userData.userId);
    };

    bot.onTradeExecuted = (stake) => {
      totalVolumeTraded += Number(stake);
    };

    bot.connect();
    bots.set(userData.userId, bot);
    console.log(`🚀 AI Bot Active for: ${userData.userId}`);
  } catch (error) {
    console.error(`❌ Failed to initialize bot for ${userData.userId}:`, error.message);
  }
}

/* ================= DASHBOARD UI ================= */

function generateStaffDashboard() {
  const commission = (totalVolumeTraded * MARKUP_PERCENT).toFixed(2);
  let rows = "";
  
  bots.forEach((bot, id) => {
    const profit = Number(bot.user?.totalProfit || 0).toFixed(2);
    rows += `<tr>
        <td><b>${id}</b></td>
        <td>$${Number(bot.user?.currentBalance || 0).toFixed(2)}</td>
        <td style="color:${profit >= 0 ? '#27ae60' : '#d91e18'};">$${profit}</td>
        <td>${bot.user.isRunning ? '🟢 Active' : '🟠 Paused'}</td>
        <td>
          <form action="/delete" method="POST" style="margin:0;">
            <input type="hidden" name="userId" value="${id}">
            <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
            <button type="submit" style="background:#ff4757; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Kill</button>
          </form>
        </td>
    </tr>`;
  });

  return `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:25px;">
        <div style="background:#e3f2fd; padding:20px; border-radius:15px; border:1px solid #bbdefb; text-align:center;">
            <small style="color:#1565c0; font-weight:bold;">TOTAL VOLUME</small><br>
            <b style="font-size:28px;">$${totalVolumeTraded.toFixed(2)}</b>
        </div>
        <div style="background:#e8f5e9; padding:20px; border-radius:15px; border:1px solid #c8e6c9; text-align:center;">
            <small style="color:#2e7d32; font-weight:bold;">MARKUP PROFIT (0.1%)</small><br>
            <b style="font-size:28px; color:#2e7d32;">$${commission}</b>
        </div>
    </div>
    <table border="1" width="100%" cellpadding="10" style="border-collapse:collapse; background:white;">
        <thead><tr style="background:#f1f1f1;"><th>User</th><th>Balance</th><th>Profit</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;">No active sessions</td></tr>'}</tbody>
    </table>`;
}

/* ================= WEB ROUTES ================= */

app.get('/', (req, res) => {
  const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=EN&brand=deriv`;

  res.send(`
    <!DOCTYPE html><html><head><title>Dans-Dans AI Bot</title><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      :root { --primary: #d91e18; --dark: #2c3e50; }
      body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; }
      .hero { background: var(--dark); color: white; padding: 50px 20px; text-align: center; }
      .container { max-width: 450px; margin: -50px auto 40px; padding: 0 15px; }
      .card { background: white; border-radius: 25px; box-shadow: 0 15px 35px rgba(0,0,0,0.1); padding: 35px; text-align:center; }
      .btn-connect { background: var(--primary); color: white; border: none; padding: 20px; border-radius: 15px; cursor: pointer; font-weight: bold; width: 100%; font-size: 18px; text-decoration:none; display:block; }
    </style>
    </head><body>
    <div class="hero"><h1>Dans-Dans Trading Bot</h1></div>
    <div class="container">
        <div class="card">
            <h2 style="margin:0 0 10px 0;">Connect Account</h2>
            <p style="color:#666; margin-bottom:30px;">Authorize the AI bot via Deriv to start trading the Digit Strategy for free.</p>
            <a href="${authUrl}" class="btn-connect">Connect via Deriv</a>
        </div>
        <div style="text-align:center; margin-top:30px;"><a href="/admin-login" style="color:#ccc; text-decoration:none; font-size:11px;">STAFF PORTAL</a></div>
    </div></body></html>`);
});

app.get('/callback', (req, res) => {
    const { acct1, token1 } = req.query;
    if (!token1) return res.send("Auth failed. Please ensure you approved the permissions.");

    const userId = `CR_${acct1}`;
    pendingUsers.set(userId, { apiToken: token1 });

    res.send(`
        <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f4f7f6;">
            <div style="background:white; max-width:400px; margin:auto; padding:40px; border-radius:20px;">
                <h1 style="color:#27ae60;">Linked!</h1>
                <p>Account <b>${userId}</b> is ready.</p>
                <p>Please wait for the Admin to activate the AI bot.</p>
                <a href="/" style="color:#d91e18;">Go Home</a>
            </div>
        </body>`);
});

/* ================= STAFF MANAGEMENT ================= */

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Access Denied");
  
  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `<tr>
        <td><b>${id}</b></td>
        <td>
            <form action="/manual-activate" method="POST" style="margin:0;">
                <input type="hidden" name="userId" value="${id}">
                <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
                <button type="submit" style="background:#27ae60; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">Approve</button>
            </form>
        </td>
    </tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:30px; background:#f4f7f6;">
      <div style="max-width:1000px; margin:auto;">
        <h1>🛡️ Staff Dashboard</h1>
        <div style="background:white; padding:20px; border-radius:15px; margin-bottom:30px;">
            <h3>Pending</h3>
            <table border="1" width="100%" cellpadding="10" style="border-collapse:collapse;">
                <tbody>${pendingRows || '<tr><td>No users waiting</td></tr>'}</tbody>
            </table>
        </div>
        <div style="background:white; padding:20px; border-radius:15px;">
            <h3>Live Stats</h3>
            ${generateStaffDashboard()}
        </div>
      </div>
    </body>`);
});

app.get('/admin-login', (req, res) => {
  res.send(`<div style="max-width:300px; margin: 100px auto; text-align:center;"><form action="/admin-portal" method="POST"><input type="password" name="password" placeholder="Admin Password" required><button type="submit">Login</button></form></div>`);
});

app.post('/manual-activate', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    try {
      await pool.query(
        `INSERT INTO users (user_id, api_token, active, is_running) 
         VALUES ($1, $2, true, true) ON CONFLICT (user_id) DO UPDATE SET active = true`, [userId, data.apiToken]
      );
      await bootBot({ userId, apiToken: data.apiToken, isRunning: true });
      pendingUsers.delete(userId);
      res.redirect(307, '/admin-portal');
    } catch (e) { res.status(500).send("DB Error"); }
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
  
  // 🔥 CRITICAL: THE CLEANER
  // Uncomment the line below ONCE and push if you still get crashes, then comment it back.
  // await pool.query("DELETE FROM users"); 

  try {
    const result = await pool.query("SELECT * FROM users WHERE active = true");
    result.rows.forEach(u => {
      bootBot({ userId: u.user_id, apiToken: u.api_token, isRunning: u.is_running });
    });
  } catch (e) { console.error("Database Startup Error"); }
  listenTelegramAdmin(bots);
});
