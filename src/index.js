import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { UserSession } from './users/userSession.js';
import { DerivBot } from './bot/DerivBot.js';
import { listenTelegramAdmin } from './notifications/telegramAdmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '../users.json');

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CONFIGURATION ================= */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const PAYMENT_NUMBER = "0713811622"; 
const HELP_LINK = "https://wa.me/message/WW67ZG52UQHOO1"; 
const SUB_PRICE = "100 KSH";
const DURATION = "7 Days (1 Week)";

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

  const session = new UserSession({ ...userData, apiToken });
  const bot = new DerivBot(session);
  
  // Flag to tell DerivBot to capture the first balance message as startBalance
  bot.user.needsStartBalance = true; 

  bot.connect();
  bots.set(userData.userId, bot);
  console.log(`🚀 Bot Instance Created: ${userData.userId}`);
}

/* ================= UI GENERATORS ================= */

// Generate Private Staff View
function generateStaffPerformanceTable() {
  if (bots.size === 0) return '<tr><td colspan="5" style="text-align:center; padding:15px; color:#888;">No active trading sessions.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = Number(bot.user?.currentBalance || 0);
    // Updated to use the tracked lifetime profit from riskManager
    const profit = Number(bot.user?.totalProfit || 0).toFixed(2);
    const color = profit >= 0 ? "#27ae60" : "#e74c3c";
    
    rows += `
      <tr>
        <td><b>${id}</b></td>
        <td style="font-weight:bold;">$${balance.toFixed(2)}</td>
        <td style="color:${color}; font-weight:bold;">$${profit}</td>
        <td>🟢 Live</td>
        <td>
          <form action="/delete" method="POST" style="margin:0;">
            <input type="hidden" name="userId" value="${id}">
            <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
            <button type="submit" style="background:#ff4757; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:11px;">Eliminate</button>
          </form>
        </td>
      </tr>`;
  });
  return rows;
}

// Generate Individual User Stats View
function generateUserStats(shortId) {
    let userData = null;
    let foundId = null;

    bots.forEach((bot, id) => {
        if (id.endsWith(shortId)) {
            userData = bot;
            foundId = id;
        }
    });

    if (!userData) return `<div style="color:#d91e18; padding:10px; font-weight:bold;">❌ No active bot found for ID ending in "${shortId}".</div>`;

    const balance = Number(userData.user?.currentBalance || 0);
    // pulling totalProfit and tradesToday directly from the bot's live user object
    const lifetimeProfit = Number(userData.user?.totalProfit || 0).toFixed(2);
    const color = lifetimeProfit >= 0 ? "#27ae60" : "#e74c3c";
    const trades = userData.user?.tradesToday || 0;

    return `
        <div style="background:#f8f9fa; border-radius:12px; padding:20px; text-align:left; border:1px solid #eee;">
            <h4 style="margin:0 0 15px 0; color:#2c3e50;">Bot: ${foundId}</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div><small>Balance</small><br><b style="font-size:18px;">$${balance.toFixed(2)}</b></div>
                <div><small>Lifetime Profit</small><br><b style="font-size:18px; color:${color};">${lifetimeProfit >= 0 ? '+' : ''}${lifetimeProfit}</b></div>
                <div><small>Trades Today</small><br><b style="font-size:18px;">${trades}</b></div>
                <div><small>Status</small><br><b style="color:#27ae60;">ACTIVE (OVER 5)</b></div>
            </div>
            <div style="text-align:center; margin-top:15px;"><a href="/" style="font-size:12px; color:#999; text-decoration:none;">Refresh / Close</a></div>
        </div>`;
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
          <div style="text-align:left; font-size:13px; color:#666; background:#fafafa; padding:15px; border-radius:10px; margin-top:20px;">
             <b>How to get token:</b> Deriv Settings > API Token > Check "Read" & "Trade".
          </div>
          <a href="${HELP_LINK}" class="help-btn" target="_blank">Chat Admin for Help</a>
        </div>

        <div class="card">
           <h4 style="margin:0 0 10px 0;">Track My Bot Progress</h4>
           <form action="/" method="GET">
              <input type="text" name="trackId" placeholder="Enter last 4 digits of ID (e.g. 001)" required>
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
      <h2 style="color:#2c3e50;">One More Step...</h2>
      <div style="background:#f1f8f3; padding:20px; border-radius:15px; border: 2px dashed #27ae60; margin:20px 0;">
        <p>Send <b>${SUB_PRICE}</b> to M-Pesa:</p>
        <h1 style="color:#1a1a1a;">${PAYMENT_NUMBER}</h1>
      </div>
      <p>Your ID: <b style="background:#eee; padding:5px; border-radius:4px;">${tempId}</b></p>
      <a href="${HELP_LINK}" style="display:block; background:#2c3e50; color:white; padding:18px; text-decoration:none; border-radius:12px; font-weight:bold; margin-top:20px;">✅ I Have Paid (Activate Now)</a>
    </div>
  `);
});

/* ================= STAFF SECTION (WITH AUTO-REFRESH) ================= */

app.get('/admin-login', (req, res) => {
  res.send(`
    <div style="max-width:300px; margin: 100px auto; font-family: sans-serif; text-align:center;">
      <form action="/admin-portal" method="POST">
        <input type="password" name="password" placeholder="Admin Password" style="width:100%; padding:10px; margin-bottom:10px;">
        <button type="submit" style="width:100%; padding:10px; background:#2c3e50; color:white; border:none; cursor:pointer;">Login</button>
      </form>
    </div>
  `);
});

app.post('/admin-portal', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.send("Denied");

  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `<tr><td>${id}</td><td><form action="/manual-activate" method="POST" style="margin:0;"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button type="submit" style="background:green; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">Approve</button></form></td></tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f0f2f5;">
      <script>setTimeout(() => { document.getElementById('refresh-form').submit(); }, 10000);</script>
      <form id="refresh-form" action="/admin-portal" method="POST" style="display:none;"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"></form>
      <div style="max-width:1000px; margin:auto; background:white; padding:30px; border-radius:20px; box-shadow:0 5px 15px rgba(0,0,0,0.05);">
        <h1>🛡️ Staff Dashboard <small style="font-size:12px; color:blue;">(Live Refreshing...)</small></h1>
        <div style="display:grid; grid-template-columns: 1fr 2fr; gap:30px;">
          <div><h3>Pending</h3><table border="1" width="100%">${pendingRows || '<tr><td>None</td></tr>'}</table></div>
          <div><h3>Performance</h3><table border="1" width="100%" style="border-collapse:collapse; text-align:left;"><tr style="background:#eee;"><th>User</th><th>Balance</th><th>Profit</th><th>Status</th><th>Action</th></tr>${generateStaffPerformanceTable()}</table></div>
        </div>
        <div style="text-align:center; margin-top:30px;"><a href="/">Logout</a></div>
      </div>
    </body>
  `);
});

/* ================= LOGIC HANDLERS ================= */

app.post('/manual-activate', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    await bootBot({ userId, apiToken: data.apiToken, market: 'R_100', active: true, minStake: 0.35 });
    pendingUsers.delete(userId);
    res.send(`Activated! <form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Back</button></form>`);
  }
});

app.post('/delete', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && bots.has(userId)) {
    const bot = bots.get(userId);
    if (bot.user?.ws) bot.user.ws.terminate();
    bots.delete(userId);
  }
  res.send(`Removed. <form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Back</button></form>`);
});

// Automation Endpoint
app.post('/api/payment-webhook', async (req, res) => {
    const { userId, status } = req.body;
    if ((status === 'SUCCESS') && pendingUsers.has(userId)) {
        const data = pendingUsers.get(userId);
        await bootBot({ userId, apiToken: data.apiToken, market: 'R_100', active: true });
        pendingUsers.delete(userId);
        return res.sendStatus(200);
    }
    res.sendStatus(400);
});

/* ================= STARTUP ================= */
app.listen(PORT, () => {
  console.log(`🌐 Server Running: Port ${PORT}`);
  if (fs.existsSync(usersFilePath)) {
    const data = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    (data.users || []).filter(u => u.active).forEach(u => bootBot(u));
  }
  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
  }
});
