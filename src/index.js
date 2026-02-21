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
const HELP_LINK = "https://bit.ly/4tJbxpH"; 
const SUB_PRICE = "100 KSH";

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

export const bots = new Map(); 
const pendingUsers = new Map(); 

/* ================= BOT BOOT LOGIC ================= */
async function bootBot(userData) {
  if (bots.has(userData.userId)) return;
  // Ensure manualStake is a number
  userData.manualStake = parseFloat(userData.manualStake) || 0.35;
  
  const session = new UserSession(userData);
  const bot = new DerivBot(session);
  bot.connect();
  bots.set(userData.userId, bot);
  console.log(`🚀 Bot Activated: ${userData.userId} with Stake: ${userData.manualStake}`);
}

/* ================= UI GENERATORS ================= */

function generateStaffPerformanceTable() {
  if (bots.size === 0) return '<tr><td colspan="5" style="text-align:center; padding:15px; color:#888;">No active bots.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = bot.user?.currentBalance || 0;
    const startBalance = bot.user?.startBalance || balance;
    const profit = (balance - startBalance).toFixed(2);
    const color = profit >= 0 ? "#27ae60" : "#e74c3c";
    
    rows += `
      <tr>
        <td><b>${id}</b><br><small>Stake: ${bot.user.manualStake}</small></td>
        <td style="font-weight:bold;">$${Number(balance).toFixed(2)}</td>
        <td style="color:${color}; font-weight:bold;">$${profit}</td>
        <td>🟢 Live</td>
        <td>
          <form action="/delete" method="POST" style="margin:0;">
            <input type="hidden" name="userId" value="${id}">
            <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
            <button type="submit" style="background:#ff4757; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;">Eliminate</button>
          </form>
        </td>
      </tr>`;
  });
  return rows;
}

function generateUserStats(shortId) {
    let userData = null;
    let foundId = null;
    bots.forEach((bot, id) => { if (id.endsWith(shortId)) { userData = bot; foundId = id; } });

    if (!userData) return `<div style="color:#d91e18; font-weight:bold;">❌ No active bot found for ID: ${shortId}</div>`;

    const profit = (userData.user.currentBalance - userData.user.startBalance).toFixed(2);
    const color = profit >= 0 ? "#27ae60" : "#e74c3c";

    return `
        <div style="background:#f9f9f9; padding:15px; border-radius:10px; text-align:left;">
            <p><b>Bot ID:</b> ${foundId}</p>
            <p><b>Balance:</b> $${userData.user.currentBalance}</p>
            <p><b>Profit:</b> <span style="color:${color}">${profit}</span></p>
            <p><b>Trades:</b> ${userData.user.tradesToday || 0}</p>
        </div>`;
}

/* ================= ROUTES ================= */

app.get('/', (req, res) => {
  const trackId = req.query.trackId;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dans-Dans Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin:0; padding:20px; text-align: center; }
        .card { background: white; max-width: 450px; margin: auto; padding: 25px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
        input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
        .btn { background: #d91e18; color: white; padding: 15px; width: 100%; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; font-size:16px;}
        .track-btn { background: #2c3e50; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Dans-Dans Bot</h1>
        <div style="background:#e8f5e9; color:#2e7d32; padding:8px; border-radius:50px; display:inline-block; font-weight:bold; margin-bottom:15px;">💰 ${SUB_PRICE} / Week</div>
        
        ${trackId ? `<div style="margin-bottom:20px;">${generateUserStats(trackId)}</div>` : ''}

        <form action="/payment-page" method="POST">
          <input type="text" name="apiToken" placeholder="Deriv API Token" required>
          <input type="number" name="manualStake" placeholder="Enter Stake (e.g. 0.35)" step="0.01" min="0.35" required>
          <button type="submit" class="btn">Connect & Pay</button>
        </form>

        <hr style="margin:25px 0; border:0; border-top:1px solid #eee;">
        
        <form action="/" method="GET">
          <input type="text" name="trackId" placeholder="Enter last 4 digits of ID">
          <button type="submit" class="btn track-btn">My Bot Status</button>
        </form>
        <div style="margin-top:20px;"><a href="/admin-login" style="color:#ccc; text-decoration:none; font-size:11px;">Staff Portal</a></div>
      </div>
    </body>
    </html>
  `);
});

app.post('/payment-page', (req, res) => {
  const { apiToken, manualStake } = req.body;
  const tempId = `User_${Math.floor(1000 + Math.random() * 9000)}`;
  pendingUsers.set(tempId, { apiToken, manualStake });
  res.send(`
    <div style="font-family:sans-serif; text-align:center; padding:50px; max-width:400px; margin:auto;">
      <h2>Confirm Payment</h2>
      <p>Pay <b>${SUB_PRICE}</b> to M-Pesa:</p>
      <h1 style="color:#27ae60;">${PAYMENT_NUMBER}</h1>
      <p>Your ID: <b style="background:#eee; padding:5px;">${tempId}</b></p>
      <p style="font-size:13px; color:#666;">Once paid, contact admin to activate.</p>
      <a href="${HELP_LINK}" style="display:block; background:#2c3e50; color:white; padding:15px; text-decoration:none; border-radius:10px; font-weight:bold; margin-top:20px;">✅ Click to Activate</a>
    </div>
  `);
});

/* ================= STAFF PORTAL SECTION ================= */

app.get('/admin-login', (req, res) => {
  res.send(`
    <div style="max-width:300px; margin: 100px auto; font-family: sans-serif; text-align:center;">
      <h3>Staff Login</h3>
      <form action="/admin-portal" method="POST">
        <input type="password" name="password" placeholder="Admin Password" style="width:100%; padding:10px; margin-bottom:10px;">
        <button type="submit" style="width:100%; padding:10px; background:#2c3e50; color:white; border:none; cursor:pointer;">Enter Portal</button>
      </form>
    </div>
  `);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Access Denied");

  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `
      <tr>
        <td>${id}<br><small>Stake: ${data.manualStake}</small></td>
        <td>
          <form action="/manual-activate" method="POST" style="margin:0;">
            <input type="hidden" name="userId" value="${id}">
            <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
            <button type="submit" style="background:green; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">Approve</button>
          </form>
        </td>
      </tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f0f2f5;">
      <script>setTimeout(() => { document.getElementById('refresh-form').submit(); }, 10000);</script>
      <form id="refresh-form" action="/admin-portal" method="POST" style="display:none;"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"></form>
      
      <div style="max-width:1100px; margin:auto; background:white; padding:30px; border-radius:20px; box-shadow:0 5px 15px rgba(0,0,0,0.05);">
        <h2 style="margin-top:0;">🛡️ Staff Management Dashboard</h2>
        <div style="display:grid; grid-template-columns: 1fr 2fr; gap:30px;">
          
          <div>
            <h3>Pending Activation</h3>
            <table border="1" width="100%" style="border-collapse:collapse; text-align:left;">
              <tr style="background:#eee;"><th>User ID</th><th>Action</th></tr>
              ${pendingRows || '<tr><td colspan="2" style="padding:10px;">None</td></tr>'}
            </table>
          </div>

          <div>
            <h3>Live Bot Performance</h3>
            <table border="1" width="100%" style="border-collapse:collapse; text-align:left;">
              <tr style="background:#eee;"><th>User</th><th>Balance</th><th>Profit</th><th>Status</th><th>Action</th></tr>
              ${generateStaffPerformanceTable()}
            </table>
          </div>

        </div>
        <div style="text-align:center; margin-top:30px;"><a href="/">Logout</a></div>
      </div>
    </body>
  `);
});

app.post('/manual-activate', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    await bootBot({ userId, apiToken: data.apiToken, manualStake: data.manualStake, market: 'R_100', active: true });
    pendingUsers.delete(userId);
    res.send(`User ${userId} Activated! <br><form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Return to Dashboard</button></form>`);
  }
});

app.post('/delete', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && bots.has(userId)) {
    const bot = bots.get(userId);
    if (bot.user?.ws) bot.user.ws.terminate();
    bots.delete(userId);
  }
  res.send(`Bot ${userId} Eliminated. <br><form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Return to Dashboard</button></form>`);
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
