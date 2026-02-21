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
  bot.connect();
  bots.set(userData.userId, bot);
  console.log(`🚀 Bot Instance Created: ${userData.userId}`);
}

/* ================= STAFF UI GENERATOR ================= */
function generateStaffPerformanceTable() {
  if (bots.size === 0) return '<tr><td colspan="5" style="text-align:center; padding:15px; color:#888;">No active trading sessions.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = bot.user?.currentBalance || 0;
    const startBalance = bot.user?.startBalance || balance;
    const profit = (balance - startBalance).toFixed(2);
    const color = profit >= 0 ? "#27ae60" : "#e74c3c";
    
    rows += `
      <tr>
        <td><b>${id}</b></td>
        <td style="font-weight:bold;">$${Number(balance).toFixed(2)}</td>
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

/* ================= USER WEB ROUTES ================= */

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dans-Dans Trading Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        :root { --primary: #d91e18; --dark: #2c3e50; }
        body { font-family: 'Segoe UI', sans-serif; background: #f8f9fa; margin: 0; }
        .hero { background: var(--dark); color: white; padding: 45px 20px; text-align: center; }
        .container { max-width: 500px; margin: -40px auto 40px; padding: 0 15px; }
        .card { background: white; border-radius: 20px; box-shadow: 0 15px 35px rgba(0,0,0,0.1); padding: 35px; text-align:center; }
        input { width: 100%; padding: 15px; border: 2px solid #eee; border-radius: 12px; box-sizing: border-box; margin: 15px 0; outline:none; }
        input:focus { border-color: var(--primary); }
        .btn-connect { background: var(--primary); color: white; border: none; padding: 18px; border-radius: 12px; cursor: pointer; font-weight: bold; width: 100%; font-size: 16px; transition: 0.2s; }
        .btn-connect:hover { opacity: 0.9; transform: scale(0.98); }
        .steps { text-align: left; background: #fdfdfd; padding: 20px; border-radius: 12px; border: 1px solid #eee; margin-top: 25px; font-size: 14px; }
        .help-btn { display: block; margin-top: 20px; color: var(--dark); font-weight: bold; text-decoration: none; border: 2px solid var(--dark); padding: 14px; border-radius: 12px; }
      </style>
    </head>
    <body>
      <div class="hero"><h1>Dans-Dans Trading Bot</h1><p>Automated Profits Made Simple</p></div>
      <div class="container">
        <div class="card">
          <div style="background:#e8f5e9; color:#2e7d32; padding:8px 20px; border-radius:50px; display:inline-block; font-weight:bold; margin-bottom:10px;">💰 ${SUB_PRICE} / Week</div>
          <form action="/payment-page" method="POST">
            <input type="text" name="apiToken" placeholder="Paste Your Deriv API Token" required>
            <button type="submit" class="btn-connect">Connect & Launch Bot</button>
          </form>
          <div class="steps">
            <strong style="color:var(--dark);">How to get your API Token:</strong><br>
            <ol style="padding-left:20px; margin-top:10px;">
              <li>Log in to <b>Deriv.com</b></li>
              <li>Go to <b>Account Settings > API Token</b></li>
              <li>Select <b>"Read"</b> and <b>"Trade"</b> checkboxes</li>
              <li>Give it a name and click <b>Create</b></li>
            </ol>
          </div>
          <a href="${HELP_LINK}" class="help-btn" target="_blank">Chat with Admin for Help</a>
        </div>
        <div style="text-align:center; margin-top:40px;"><a href="/admin-login" style="color:#bbb; text-decoration:none; font-size:12px;">Staff Access Portal</a></div>
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
    <div style="max-width:450px; margin: 60px auto; font-family: sans-serif; text-align:center; padding:30px; background:white; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.1);">
      <h2 style="color:#2c3e50;">Payment Verification</h2>
      <div style="background:#f1f8f3; padding:25px; border-radius:15px; border: 2px dashed #27ae60; margin:20px 0;">
        <p style="margin:0; color:#666; font-size:14px;">Send <b>${SUB_PRICE}</b> to M-Pesa:</p>
        <h1 style="color:#1a1a1a; margin:10px 0;">${PAYMENT_NUMBER}</h1>
        <p style="margin:0; font-weight:bold;">Duration: ${DURATION}</p>
      </div>
      <p>Your Unique ID: <b style="background:#eee; padding:2px 6px; border-radius:4px;">${tempId}</b></p>
      <p style="font-size:13px; color:#666;">Copy the M-Pesa confirmation message and your ID, then click below to activate.</p>
      <a href="${HELP_LINK}" style="display:block; background:#2c3e50; color:white; padding:18px; text-decoration:none; border-radius:12px; font-weight:bold; margin-top:20px;">✅ I Have Paid (Activate Bot)</a>
      <br><a href="/" style="color:#999; text-decoration:none; font-size:13px;">Cancel</a>
    </div>
  `);
});

/* ================= STAFF CONTROL CENTER ================= */

app.get('/admin-login', (req, res) => {
  res.send(`
    <div style="max-width:320px; margin: 120px auto; font-family: sans-serif; text-align:center; padding:30px; border-radius:15px; background:white; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
      <h3 style="margin-top:0;">Staff Portal</h3>
      <form action="/admin-portal" method="POST">
        <input type="password" name="password" placeholder="Admin Password" style="width:100%; padding:12px; border:1px solid #ddd; border-radius:8px; margin-bottom:15px;" required>
        <button type="submit" style="width:100%; padding:12px; background:#2c3e50; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">Login</button>
      </form>
    </div>
  `);
});

app.post('/admin-portal', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.send("Access Denied");

  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `<tr><td>${id}</td><td>
      <form action="/manual-activate" method="POST" style="margin:0;">
        <input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}">
        <button type="submit" style="background:#2ecc71; color:white; border:none; padding:6px 12px; border-radius:5px; cursor:pointer; font-weight:bold;">Approve</button>
      </form></td></tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f0f2f5;">
      <script>
        // AUTO-REFRESH SCRIPT: RELOADS EVERY 10 SECONDS
        setTimeout(() => { document.getElementById('refresh-form').submit(); }, 10000);
      </script>

      <form id="refresh-form" action="/admin-portal" method="POST" style="display:none;">
        <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
      </form>

      <div style="max-width:1000px; margin:auto; background:white; padding:35px; border-radius:20px; box-shadow:0 10px 25px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #eee; padding-bottom:15px; margin-bottom:25px;">
          <h1 style="margin:0; color:#2c3e50;">🛡️ Staff Control Center</h1>
          <span style="color:blue; font-size:12px; background:#eef; padding:5px 10px; border-radius:5px;">Live Refresh: Active</span>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1.8fr; gap:40px;">
          <div>
            <h3 style="color:#d91e18;">Pending Payments</h3>
            <table border="1" width="100%" style="border-collapse:collapse; text-align:left;">
              <tr style="background:#f8f9fa;"><th>ID</th><th>Action</th></tr>
              ${pendingRows || '<tr><td colspan="2" style="text-align:center; padding:15px; color:#888;">No waiting users</td></tr>'}
            </table>
          </div>
          <div>
            <h3 style="color:#2ecc71;">Market Performance</h3>
            <table border="1" width="100%" style="border-collapse:collapse; text-align:left;">
              <tr style="background:#f8f9fa;"><th>User ID</th><th>Balance</th><th>Profit</th><th>Status</th><th>Control</th></tr>
              ${generateStaffPerformanceTable()}
            </table>
          </div>
        </div>
        <div style="text-align:center; margin-top:50px;"><a href="/" style="color:#999; text-decoration:none;">Logout</a></div>
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
    res.send(`<h3>Success! Bot ${userId} is now Live.</h3><form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Back to Portal</button></form>`);
  }
});

app.post('/delete', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && bots.has(userId)) {
    const botToKill = bots.get(userId);
    if (botToKill.user?.ws) botToKill.user.ws.terminate();
    bots.delete(userId);
  }
  res.send(`User ${userId} Eliminated. <form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Back to Portal</button></form>`);
});

// WEBHOOK ARCHITECTURE (For Future Auto-Payments)
app.post('/api/payment-webhook', async (req, res) => {
    const { userId, status } = req.body;
    if ((status === 'COMPLETED' || status === 'SUCCESS') && pendingUsers.has(userId)) {
        const data = pendingUsers.get(userId);
        await bootBot({ userId, apiToken: data.apiToken, market: 'R_100', active: true });
        pendingUsers.delete(userId);
        return res.sendStatus(200);
    }
    res.sendStatus(400);
});

/* ================= STARTUP ================= */
app.listen(PORT, () => {
  console.log(`🌐 Server active on port ${PORT}`);
  if (fs.existsSync(usersFilePath)) {
    const data = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    (data.users || []).filter(u => u.active).forEach(u => bootBot(u));
  }
  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
  }
});
