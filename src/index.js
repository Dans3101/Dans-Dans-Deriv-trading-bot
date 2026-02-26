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
const MARKUP_PERCENT = 0.001; // 0.1%

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

export const bots = new Map(); 
const pendingUsers = new Map(); 
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
    
    // Safety: prevent server crash on 403/Connection errors
    bot.onConnectionError = (err) => {
        console.error(`⚠️ Connection Error for ${userData.userId}: ${err.message}`);
        bots.delete(userData.userId);
    };

    // Markup Volume Tracker Hook
    bot.onTradeExecuted = (stake) => {
      totalVolumeTraded += Number(stake);
    };

    bot.connect();
    bots.set(userData.userId, bot);
  } catch (error) {
    console.error(`❌ Initialization Failed:`, error.message);
  }
}

/* ================= UI GENERATORS ================= */

function generateUserTrackingCard(shortId) {
    let activeBot = null;
    bots.forEach((bot, id) => { if (id.endsWith(shortId)) activeBot = bot; });

    if (!activeBot) return `<div style="color:red; padding:20px;">❌ Bot ID ...${shortId} not found or not active.</div><a href="/" style="text-decoration:none; color:#666;">⬅️ Back</a>`;

    const u = activeBot.user;
    const isDemo = u.apiToken.toLowerCase().startsWith('d') || u.userId.includes('VRTC');
    
    return `
        <div style="text-align:left; background:#f9f9f9; padding:20px; border-radius:15px; border:1px solid #eee;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <b style="color:#2c3e50;">ID: ...${shortId}</b>
                <span style="background:${isDemo ? '#fff3e0' : '#e8f5e9'}; color:${isDemo ? '#e67e22' : '#2e7d32'}; padding:3px 10px; border-radius:50px; font-size:11px; font-weight:bold;">
                    ${isDemo ? '🟡 DEMO' : '🟢 REAL'}
                </span>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px;">
                <div style="background:white; padding:10px; border-radius:8px;">
                    <small style="color:#888;">Balance</small><br><b style="font-size:18px;">$${Number(u.currentBalance).toFixed(2)}</b>
                </div>
                <div style="background:white; padding:10px; border-radius:8px;">
                    <small style="color:#888;">Profit</small><br><b style="font-size:18px; color:${u.totalProfit >= 0 ? '#27ae60' : '#d91e18'};">$${Number(u.totalProfit).toFixed(2)}</b>
                </div>
            </div>
            <div style="display:flex; gap:10px;">
                <form action="/user/toggle" method="POST" style="flex:1;">
                    <input type="hidden" name="trackId" value="${shortId}">
                    <button type="submit" style="width:100%; padding:12px; border-radius:10px; border:none; background:${u.isRunning ? '#e67e22' : '#27ae60'}; color:white; font-weight:bold; cursor:pointer;">
                        ${u.isRunning ? '⏸ Pause Bot' : '▶️ Resume Bot'}
                    </button>
                </form>
                <a href="/" style="flex:0.5; text-align:center; padding:12px; background:#eee; border-radius:10px; text-decoration:none; color:#333; font-weight:bold;">Logout</a>
            </div>
        </div>`;
}

function generateStaffTable() {
    const commission = (totalVolumeTraded * MARKUP_PERCENT).toFixed(2);
    let rows = "";
    bots.forEach((bot, id) => {
        rows += `<tr>
            <td>${id}</td>
            <td>$${Number(bot.user.currentBalance).toFixed(2)}</td>
            <td style="color:${bot.user.totalProfit >= 0 ? 'green' : 'red'}">$${Number(bot.user.totalProfit).toFixed(2)}</td>
            <td>${bot.user.isRunning ? '🟢 Live' : '🟠 Paused'}</td>
            <td><form action="/delete" method="POST" style="margin:0;"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button type="submit" style="background:red; color:white; border:none; padding:4px 8px; border-radius:4px;">Kill</button></form></td>
        </tr>`;
    });
    return { rows, commission };
}

/* ================= ROUTES ================= */

app.get('/', (req, res) => {
  const trackId = req.query.trackId;
  const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=EN&brand=deriv`;

  res.send(`
    <!DOCTYPE html><html><head><title>Dans-Dans AI</title><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: sans-serif; background: #f4f7f6; margin: 0; display:flex; flex-direction:column; align-items:center; }
      .container { max-width: 400px; width: 90%; margin-top: 50px; }
      .card { background: white; padding: 30px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align:center; margin-bottom:20px; }
      .btn { display:block; padding:15px; border-radius:12px; text-decoration:none; font-weight:bold; margin-bottom:10px; border:none; cursor:pointer; width:100%; box-sizing:border-box; }
      .btn-red { background: #d91e18; color: white; }
      .btn-dark { background: #2c3e50; color: white; }
    </style>
    </head><body>
      <div class="container">
        <h2 style="text-align:center; color:#2c3e50;">Dans-Dans AI Bot</h2>
        
        ${trackId ? `<div class="card">${generateUserTrackingCard(trackId)}</div>` : `
          <div class="card">
            <h3>Start Trading</h3>
            <p style="color:#666; font-size:14px;">Connect your account via official Deriv OAuth to launch the AI.</p>
            <a href="${authUrl}" class="btn btn-red">Connect via Deriv</a>
          </div>
          <div class="card">
            <h3>Track Progress</h3>
            <form action="/" method="GET">
                <input type="text" name="trackId" placeholder="Last 4 digits of ID" style="width:100%; padding:12px; margin-bottom:10px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box; text-align:center;">
                <button type="submit" class="btn btn-dark">Monitor My Bot</button>
            </form>
          </div>
        `}
        <div style="text-align:center;"><a href="/admin-login" style="color:#ccc; text-decoration:none; font-size:11px;">Admin Portal</a></div>
      </div>
    </body></html>`);
});

app.get('/callback', (req, res) => {
    const { acct1, token1 } = req.query;
    if (!token1) return res.send("Auth failed.");
    const userId = `CR_${acct1}`;
    pendingUsers.set(userId, { apiToken: token1 });
    res.send(`<body style="text-align:center; font-family:sans-serif; padding-top:100px;"><h1>✅ Linked!</h1><p>ID: ${userId}</p><p>Admin will activate you shortly.</p><a href="/">Return Home</a></body>`);
});

app.get('/admin-login', (req, res) => {
    res.send(`<body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; background:#f4f7f6;"><div style="background:white; padding:30px; border-radius:15px; text-align:center;"><form action="/admin-portal" method="POST"><h3>Staff Access</h3><input type="password" name="password" placeholder="Password" style="padding:10px; margin-bottom:10px;"><br><button type="submit">Login</button></form><br><a href="/" style="color:#999; text-decoration:none; font-size:12px;">✖ Exit to Home</a></div></body>`);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");
  const { rows, commission } = generateStaffTable();
  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `<tr><td>${id}</td><td><form action="/manual-activate" method="POST" style="margin:0;"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button type="submit" style="background:green; color:white; border:none; padding:5px 10px; border-radius:4px;">Approve</button></form></td></tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; background:#f4f7f6; padding:20px;">
      <div style="max-width:900px; margin:auto; background:white; padding:25px; border-radius:15px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h2>🛡️ Staff Dashboard</h2>
            <a href="/" style="background:#2c3e50; color:white; text-decoration:none; padding:8px 15px; border-radius:8px; font-weight:bold;">Logout/Exit</a>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin:20px 0;">
            <div style="background:#e3f2fd; padding:15px; border-radius:10px; text-align:center;">Volume: <b>$${totalVolumeTraded.toFixed(2)}</b></div>
            <div style="background:#e8f5e9; padding:15px; border-radius:10px; text-align:center;">Markup (0.1%): <b style="color:green;">$${commission}</b></div>
        </div>
        <h3>Pending Approvals</h3>
        <table border="1" width="100%" cellpadding="10" style="border-collapse:collapse; margin-bottom:20px;">${pendingRows || '<tr><td>None</td></tr>'}</table>
        <h3>Live Bots</h3>
        <table border="1" width="100%" cellpadding="10" style="border-collapse:collapse;">
            <thead><tr style="background:#eee;"><th>User</th><th>Balance</th><th>Profit</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5">No bots live</td></tr>'}</tbody>
        </table>
      </div>
    </body>`);
});

app.post('/user/toggle', (req, res) => {
    const { trackId } = req.body;
    bots.forEach((bot, id) => { 
        if (id.endsWith(trackId)) {
            bot.user.isRunning = !bot.user.isRunning; 
        } 
    });
    res.redirect(`/?trackId=${trackId}`);
});

app.post('/manual-activate', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    await pool.query(`INSERT INTO users (user_id, api_token, active, is_running) VALUES ($1, $2, true, true) ON CONFLICT (user_id) DO UPDATE SET active = true`, [userId, data.apiToken]);
    await bootBot({ userId, apiToken: data.apiToken, isRunning: true });
    pendingUsers.delete(userId);
    res.redirect(307, '/admin-portal');
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

app.listen(PORT, async () => {
  console.log(`🌐 Server Running on Port ${PORT}`);
  try {
    const result = await pool.query("SELECT * FROM users WHERE active = true");
    result.rows.forEach(u => bootBot({ userId: u.user_id, apiToken: u.api_token, isRunning: u.is_running }));
  } catch (e) { console.error("DB Error"); }
  listenTelegramAdmin(bots);
});
