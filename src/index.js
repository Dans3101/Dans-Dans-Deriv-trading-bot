import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg'; // Import Supabase driver
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

/* ================= STORAGE ================= */
export const bots = new Map(); 
const pendingUsers = new Map(); 

/* ================= BOT BOOT LOGIC ================= */
async function bootBot(userData) {
  if (bots.has(userData.userId)) return;
  const apiToken = userData.apiToken?.startsWith('ENV:') ? process.env[userData.apiToken.replace('ENV:', '')] : userData.apiToken;
  if (!apiToken) return;

  const session = new UserSession({
    ...userData,
    apiToken,
    totalProfit: Number(userData.totalProfit) || 0,
    tradesToday: Number(userData.tradesToday) || 0,
    currentMultiplier: Number(userData.currentMultiplier) || 1
  });

  const bot = new DerivBot(session);
  bot.connect();
  bots.set(userData.userId, bot);
  console.log(`🚀 Bot Instance Active: ${userData.userId}`);
}

/* ================= UI GENERATORS ================= */

function generateUserStats(shortId) {
    let userData = null;
    let fullId = null;
    bots.forEach((bot, id) => { if (id.endsWith(shortId)) { userData = bot; fullId = id; } });

    if (!userData) return `<div style="color:#d91e18; padding:10px; font-weight:bold;">❌ No active bot found for ID ending in "${shortId}".</div>`;

    const balance = Number(userData.user?.currentBalance || 0).toFixed(2);
    const profit = Number(userData.user?.totalProfit || 0).toFixed(2);
    const color = profit >= 0 ? "#27ae60" : "#e74c3c";

    return `
        <div style="background:#f8f9fa; border-radius:12px; padding:20px; text-align:left; border:1px solid #eee;">
            <h4 style="margin:0 0 15px 0; color:#2c3e50;">Bot: ${fullId}</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div><small>Balance</small><br><b style="font-size:18px;">$${balance}</b></div>
                <div><small>Lifetime Profit</small><br><b style="font-size:18px; color:${color};">$${profit}</b></div>
                <div><small>Trades</small><br><b style="font-size:18px;">${userData.user.tradesToday}</b></div>
                <div><small>Status</small><br><b style="color:#27ae60;">ACTIVE</b></div>
            </div>
            <div style="text-align:center; margin-top:10px;"><a href="/" style="color:#999; font-size:12px; text-decoration:none;">← Close Tracking</a></div>
        </div>`;
}

function generateStaffPerformanceTable() {
  if (bots.size === 0) return '<tr><td colspan="5" style="text-align:center; padding:15px; color:#888;">No active sessions.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const profit = Number(bot.user?.totalProfit || 0).toFixed(2);
    rows += `<tr>
        <td><b>${id}</b></td>
        <td>$${Number(bot.user?.currentBalance || 0).toFixed(2)}</td>
        <td style="color:${profit >= 0 ? '#27ae60' : '#e74c3c'}; font-weight:bold;">$${profit}</td>
        <td>🟢 Live</td>
        <td><form action="/delete" method="POST" style="margin:0;"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button type="submit" style="background:#ff4757; color:white; border:none; border-radius:4px; cursor:pointer; padding:5px 10px;">Kill</button></form></td>
    </tr>`;
  });
  return rows;
}

/* ================= WEB ROUTES ================= */

app.get('/', (req, res) => {
  const trackId = req.query.trackId;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dans-Dans Trading Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        :root { --primary: #d91e18; --dark: #2c3e50; }
        body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; }
        .hero { background: var(--dark); color: white; padding: 40px 20px; text-align: center; }
        .container { max-width: 500px; margin: -40px auto 40px; padding: 0 15px; }
        .card { background: white; border-radius: 20px; box-shadow: 0 15px 35px rgba(0,0,0,0.1); padding: 30px; text-align:center; margin-bottom:20px;}
        input { width: 100%; padding: 14px; border: 2px solid #eee; border-radius: 12px; box-sizing: border-box; margin: 10px 0; outline:none; }
        .btn-connect { background: var(--primary); color: white; border: none; padding: 18px; border-radius: 12px; cursor: pointer; font-weight: bold; width: 100%; font-size: 16px; }
        .btn-track { background: var(--dark); color: white; border: none; padding: 12px; border-radius: 10px; cursor: pointer; font-weight: bold; width: 100%; }
        .help-btn { display: block; margin-top: 15px; color: var(--dark); font-weight: bold; text-decoration: none; border: 2px solid #ddd; padding: 12px; border-radius: 12px; }
      </style>
    </head>
    <body>
      <div class="hero"><h1>Dans-Dans Trading Bot</h1></div>
      <div class="container">
        ${trackId ? `<div class="card" style="border: 2px solid var(--primary);">${generateUserStats(trackId)}</div>` : ''}
        <div class="card">
          <div style="background:#e8f5e9; color:#2e7d32; padding:5px 15px; border-radius:50px; display:inline-block; font-weight:bold; font-size:12px; margin-bottom:10px;">💰 ${SUB_PRICE} / Week</div>
          <form action="/payment-page" method="POST">
            <input type="text" name="apiToken" placeholder="Paste Deriv API Token" required>
            <button type="submit" class="btn-connect">Connect & Launch Bot</button>
          </form>
          <a href="${HELP_LINK}" class="help-btn" target="_blank">Chat Admin for Help</a>
        </div>
        <div class="card">
           <form action="/" method="GET">
              <input type="text" name="trackId" placeholder="Enter last 4 digits of ID" required>
              <button type="submit" class="btn-track">View My Live Stats</button>
           </form>
        </div>
        <div style="text-align:center;"><a href="/admin-login" style="color:#ccc; text-decoration:none; font-size:11px;">Staff Portal</a></div>
      </div>
    </body>
    </html>
  `);
});

app.post('/payment-page', (req, res) => {
  const { apiToken } = req.body;
  const tempId = `User_${Math.floor(1000 + Math.random() * 9000)}`;
  pendingUsers.set(tempId, { apiToken });
  res.send(`
    <div style="max-width:400px; margin: 60px auto; font-family: sans-serif; text-align:center; padding:30px; background:white; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.1);">
      <h2>Payment Details</h2>
      <p>Send <b>${SUB_PRICE}</b> to M-Pesa:</p>
      <h1 style="color:#1a1a1a;">${PAYMENT_NUMBER}</h1>
      <p>Your ID: <b>${tempId}</b></p>
      <a href="${HELP_LINK}" style="display:block; background:#2c3e50; color:white; padding:18px; text-decoration:none; border-radius:12px; font-weight:bold; margin-top:20px;">✅ I Have Paid</a>
      <a href="/" style="display:block; margin-top:20px; color:#777; text-decoration:none; font-size:14px;">← Go Back</a>
    </div>
  `);
});

/* ================= STAFF SECTION ================= */

app.get('/admin-login', (req, res) => {
  res.send(`
    <div style="max-width:300px; margin: 100px auto; text-align:center; font-family:sans-serif;">
      <h2>Staff Portal</h2>
      <form action="/admin-portal" method="POST">
        <input type="password" name="password" placeholder="Admin Password" required style="width:100%; padding:10px; margin-bottom:10px;">
        <button type="submit" style="width:100%; padding:10px; background:#2c3e50; color:white; border:none; cursor:pointer;">Login</button>
      </form>
    </div>
  `);
});

app.post('/admin-portal', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.send("Denied. <a href='/admin-login'>Back</a>");

  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `<tr><td>${id}</td><td><form action="/manual-activate" method="POST"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button type="submit">Approve</button></form></td></tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f4f7f6;">
      <script>setTimeout(() => { document.getElementById('refresh-form').submit(); }, 12000);</script>
      <form id="refresh-form" action="/admin-portal" method="POST" style="display:none;"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"></form>
      <div style="max-width:1100px; margin:auto; background:white; padding:25px; border-radius:15px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h1>🛡️ Staff Dashboard</h1>
            <a href="/" style="text-decoration:none; color:#333;">Logout</a>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 2fr; gap:25px;">
          <div>
            <h3>Pending</h3>
            <table border="1" width="100%">${pendingRows || '<tr><td>None</td></tr>'}</table>
          </div>
          <div>
            <h3>Live Performance</h3>
            <table border="1" width="100%">${generateStaffPerformanceTable()}</table>
          </div>
        </div>
      </div>
    </body>
  `);
});

/* ================= LOGIC HANDLERS ================= */

app.post('/manual-activate', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    
    try {
      // SAVE TO SUPABASE
      await pool.query(
        `INSERT INTO users (user_id, api_token, active, total_profit, trades_today, current_multiplier) 
         VALUES ($1, $2, true, 0, 0, 1)
         ON CONFLICT (user_id) DO UPDATE SET active = true, api_token = $2`,
        [userId, data.apiToken]
      );

      await bootBot({ userId, apiToken: data.apiToken, totalProfit: 0, tradesToday: 0, currentMultiplier: 1 });
      pendingUsers.delete(userId);
      res.send(`Activated! <form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Back</button></form>`);
    } catch (e) {
      res.status(500).send("DB Error: " + e.message);
    }
  }
});

app.post('/delete', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const bot = bots.get(userId);
    if (bot?.user?.ws) bot.user.ws.terminate();
    bots.delete(userId);
    
    try {
      // REMOVE FROM SUPABASE
      await pool.query("DELETE FROM users WHERE user_id = $1", [userId]);
    } catch (e) { console.error(e); }
  }
  res.send(`<form id="back" action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"></form><script>document.getElementById('back').submit();</script>`);
});

/* ================= STARTUP ================= */
app.listen(PORT, async () => {
  console.log(`🌐 Server Running: Port ${PORT}`);

  try {
    // 1. Ensure Table has necessary columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        api_token TEXT,
        app_id TEXT,
        ws_url TEXT,
        total_profit NUMERIC DEFAULT 0,
        trades_today INTEGER DEFAULT 0,
        current_multiplier NUMERIC DEFAULT 1,
        active BOOLEAN DEFAULT true
      )
    `);

    // 2. AUTO-LOAD MAIN BOT FROM ENV
    const mainToken = process.env.DERIV_API_TOKEN;
    const mainAppId = process.env.DERIV_APP_ID;
    const mainWsUrl = process.env.DERIV_WS_URL || 'wss://ws.derivws.com/websockets/v3';

    if (mainToken) {
      console.log("🔍 Checking for Primary Bot in DB...");
      const checkAdmin = await pool.query("SELECT * FROM users WHERE user_id = $1", ['Primary_Bot']);
      
      if (checkAdmin.rows.length === 0) {
        console.log("📝 Auto-registering Primary Bot from Render Environments...");
        await pool.query(
          `INSERT INTO users (user_id, api_token, app_id, ws_url, active, total_profit, trades_today, current_multiplier) 
           VALUES ($1, $2, $3, $4, true, 0, 0, 1)`,
          ['Primary_Bot', mainToken, mainAppId, mainWsUrl]
        );
      }
    }

    // 3. Load all active users
    const result = await pool.query("SELECT * FROM users WHERE active = true");
    console.log(`📦 Database loaded. Booting ${result.rows.length} bot(s)...`);
    
    result.rows.forEach(u => {
      bootBot({
        userId: u.user_id,
        apiToken: u.api_token,
        appId: u.app_id || process.env.DERIV_APP_ID, // Fallback to env if not in DB
        wsUrl: u.ws_url || process.env.DERIV_WS_URL,
        totalProfit: Number(u.total_profit),
        tradesToday: u.trades_today,
        currentMultiplier: Number(u.current_multiplier)
      });
    });
  } catch (e) {
    console.error("DB Startup Error:", e.message);
  }

  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
  }
});

