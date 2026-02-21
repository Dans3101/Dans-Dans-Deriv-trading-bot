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
}

/* ================= STAFF UI GENERATOR ================= */
function generateStaffPerformanceTable() {
  if (bots.size === 0) return '<tr><td colspan="4" style="text-align:center; padding:15px;">No active bots.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = bot.user?.currentBalance || 0;
    const startBalance = bot.user?.startBalance || balance;
    const profit = (balance - startBalance).toFixed(2);
    const color = profit >= 0 ? "#27ae60" : "#e74c3c";
    
    rows += `
      <tr>
        <td><b>${id}</b></td>
        <td style="color:${color}; font-weight:bold;">$${profit}</td>
        <td>🟢 Live</td>
        <td>
          <form action="/delete" method="POST" style="margin:0;">
            <input type="hidden" name="userId" value="${id}">
            <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
            <button type="submit" style="background:#ff4757; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:11px;">Eliminate</button>
          </form>
        </td>
      </tr>`;
  });
  return rows;
}

/* ================= WEB ROUTES ================= */

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dans-Dans Deriv Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        :root { --primary: #d91e18; --dark: #2c3e50; }
        body { font-family: sans-serif; background: #f8f9fa; margin: 0; }
        .hero { background: var(--dark); color: white; padding: 40px 20px; text-align: center; }
        .container { max-width: 500px; margin: -30px auto 40px; padding: 0 15px; }
        .card { background: white; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); padding: 30px; text-align:center; }
        input { width: 100%; padding: 14px; border: 2px solid #eee; border-radius: 10px; box-sizing: border-box; margin: 10px 0; }
        .btn-connect { background: var(--primary); color: white; border: none; padding: 16px; border-radius: 12px; cursor: pointer; font-weight: bold; width: 100%; font-size: 16px; }
        .steps { text-align: left; background: #fafafa; padding: 15px; border-radius: 12px; margin-top: 20px; font-size: 14px; }
        .help-btn { display: block; margin-top: 20px; color: var(--dark); font-weight: bold; text-decoration: none; border: 2px solid var(--dark); padding: 12px; border-radius: 12px; }
      </style>
    </head>
    <body>
      <div class="hero"><h1>Dans-Dans Trading Bot</h1></div>
      <div class="container">
        <div class="card">
          <div style="background:#e8f5e9; color:#2e7d32; padding:8px; border-radius:50px; display:inline-block; font-weight:bold; margin-bottom:15px;">💰 ${SUB_PRICE} per week</div>
          <form action="/payment-page" method="POST">
            <input type="text" name="apiToken" placeholder="Enter Deriv API Token" required>
            <button type="submit" class="btn-connect">Connect & Activate</button>
          </form>
          <div class="steps">
            <strong>How to get API Token:</strong><br>
            1. Login to Deriv.com<br>
            2. Settings > API Token<br>
            3. Select "Read" & "Trade"<br>
            4. Generate and paste above.
          </div>
          <a href="${HELP_LINK}" class="help-btn" target="_blank">Chat with Admin</a>
        </div>
        <div style="text-align:center; margin-top:30px;"><a href="/admin-login" style="color:#ccc; text-decoration:none; font-size:12px;">Staff Portal</a></div>
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
    <div style="max-width:400px; margin: 50px auto; font-family: sans-serif; text-align:center; padding:20px;">
      <h2>Activate Your Bot</h2>
      <div style="background:#f1f8f3; padding:20px; border-radius:15px; border: 2px dashed #27ae60;">
        <p>Send <b>${SUB_PRICE}</b> to M-Pesa:</p>
        <h1 style="color:#1a1a1a;">${PAYMENT_NUMBER}</h1>
      </div>
      <p>Your Bot ID: <b>${tempId}</b></p>
      <a href="${HELP_LINK}" style="display:block; background:#2c3e50; color:white; padding:16px; text-decoration:none; border-radius:12px; font-weight:bold; margin-top:20px;">I've Paid - Click to Activate</a>
    </div>
  `);
});

/* ================= STAFF CONTROL ================= */

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
  if (password !== ADMIN_PASSWORD) return res.send("Access Denied");

  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `<tr><td>${id}</td><td>
      <form action="/manual-activate" method="POST" style="margin:0;">
        <input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}">
        <button type="submit" style="background:#2ecc71; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Approve</button>
      </form></td></tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f0f2f5;">
      <div style="max-width:900px; margin:auto; background:white; padding:30px; border-radius:15px; box-shadow:0 5px 15px rgba(0,0,0,0.05);">
        <h1>🛡️ Staff Control Center</h1>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
          <div>
            <h3>Pending Activations</h3>
            <table border="1" width="100%" style="border-collapse:collapse;">
              <tr style="background:#eee;"><th>ID</th><th>Action</th></tr>
              ${pendingRows || '<tr><td colspan="2" style="text-align:center; padding:10px;">None</td></tr>'}
            </table>
          </div>
          <div>
            <h3>Live Market Performance</h3>
            <table border="1" width="100%" style="border-collapse:collapse;">
              <tr style="background:#eee;"><th>User</th><th>Profit</th><th>Status</th><th>Control</th></tr>
              ${generateStaffPerformanceTable()}
            </table>
          </div>
        </div>
        <div style="text-align:center; margin-top:40px;"><a href="/">Logout</a></div>
      </div>
    </body>
  `);
});

app.post('/manual-activate', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    await bootBot({ userId, apiToken: data.apiToken, market: 'R_100', active: true, minStake: 0.35 });
    pendingUsers.delete(userId);
    res.send(`Success! Bot ${userId} started. <form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Back</button></form>`);
  }
});

// TERMINATION ROUTE (The "Eliminate" button)
app.post('/delete', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && bots.has(userId)) {
    const botToKill = bots.get(userId);
    if (botToKill.user?.ws) botToKill.user.ws.terminate();
    bots.delete(userId);
    console.log(`🗑️ Admin eliminated bot: ${userId}`);
  }
  // This helps go back to the portal after eliminating
  res.send(`Bot ${userId} eliminated. <form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Back to Portal</button></form>`);
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
