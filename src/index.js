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

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* ================= STORAGE ================= */
export const bots = new Map(); 
const pendingUsers = new Map(); // Users who submitted token but haven't been activated yet

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

/* ================= UI GENERATORS ================= */
function generatePublicTable() {
  if (bots.size === 0) return '<tr><td colspan="4" style="text-align:center; padding:20px; color:#999;">No active bots. Join the pool today!</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = bot.user?.currentBalance || 0;
    const startBalance = bot.user?.startBalance || balance;
    const profit = (balance - startBalance).toFixed(2);
    const color = profit >= 0 ? "#27ae60" : "#e74c3c";
    rows += `<tr><td><b>${id}</b></td><td>$${Number(balance).toFixed(2)}</td><td style="color:${color};font-weight:bold;">${profit >= 0 ? '+' : ''}${profit}</td><td>🟢 Live</td></tr>`;
  });
  return rows;
}

/* ================= WEB ROUTES ================= */

// --- MAIN USER DASHBOARD ---
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Deriv Bot Hub</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: auto; }
        .card { background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); padding: 25px; margin-bottom: 20px; }
        .btn-start { background: #d91e18; color: white; border: none; padding: 12px 25px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; margin-top:10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        td, th { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
        .help-btn { display: inline-block; margin-top: 15px; color: #3498db; text-decoration: none; font-weight: bold; border: 1px solid #3498db; padding: 10px 20px; border-radius: 8px; }
        .admin-footer { text-align: center; margin-top: 50px; }
        .admin-link { color: #ccc; text-decoration: none; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card" style="text-align:center;">
          <h1>🤖 Deriv Automated Trading</h1>
          <p>Connect your account and start earning today.</p>
          <form action="/payment-page" method="POST">
            <input type="text" name="apiToken" placeholder="Paste Your Deriv API Token" required style="width:100%; padding:12px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box;">
            <button type="submit" class="btn-start">Connect & Activate</button>
          </form>
          <a href="${HELP_LINK}" class="help-btn" target="_blank">❓ Need Help / Contact Admin</a>
        </div>

        <div class="card">
          <h2>📊 Live Performance</h2>
          <table>
            <thead><tr><th>User ID</th><th>Balance</th><th>Profit</th><th>Status</th></tr></thead>
            <tbody>${generatePublicTable()}</tbody>
          </table>
        </div>

        <div class="admin-footer">
          <a href="/admin-login" class="admin-link">Staff Login</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// --- PAYMENT INSTRUCTIONS PAGE ---
app.post('/payment-page', (req, res) => {
  const { apiToken } = req.body;
  const tempId = `User_${Math.floor(1000 + Math.random() * 9000)}`;
  pendingUsers.set(tempId, { apiToken });

  res.send(`
    <div style="max-width:450px; margin: 60px auto; font-family: sans-serif; background:white; padding:30px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.1); text-align:center;">
      <h2 style="color:#2c3e50;">Payment Required</h2>
      <p>To activate Bot ID: <b>${tempId}</b></p>
      <div style="background:#f8f9fa; padding:20px; border-radius:10px; margin:20px 0; border: 1px solid #eee;">
        <p style="margin:0; color:#666;">Send Subscription Fee to:</p>
        <h1 style="margin:10px 0; color:#27ae60;">${PAYMENT_NUMBER}</h1>
      </div>
      <p style="font-size: 14px;">Once payment is sent, click the button below to send your <b>M-Pesa message</b> and <b>User ID (${tempId})</b> to the admin for activation.</p>
      <a href="${HELP_LINK}" style="display:block; background:#3498db; color:white; padding:15px; text-decoration:none; border-radius:10px; font-weight:bold; margin-top:20px;">✅ I Have Paid (Chat Admin)</a>
      <br>
      <a href="/" style="color:#999; text-decoration:none; font-size:13px;">← Back to Home</a>
    </div>
  `);
});

/* ================= RESTORED ADMIN SECTION ================= */

// 1. Admin Login Page
app.get('/admin-login', (req, res) => {
  res.send(`
    <div style="max-width:350px; margin: 100px auto; font-family: sans-serif; text-align:center; padding:30px; border:1px solid #ddd; border-radius:10px;">
      <h2>🛡️ Admin Login</h2>
      <form action="/admin-portal" method="POST">
        <input type="password" name="password" placeholder="Enter Admin Password" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:5px;" required>
        <button type="submit" style="width:100%; padding:10px; background:#2c3e50; color:white; border:none; border-radius:5px; cursor:pointer;">Enter Portal</button>
      </form>
      <br><a href="/" style="font-size:12px; color:#666;">Exit</a>
    </div>
  `);
});

// 2. Admin Portal (The Dashboard)
app.post('/admin-portal', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.send("<h3>❌ Unauthorized</h3><a href='/admin-login'>Try again</a>");

  let activeRows = "";
  bots.forEach((bot, id) => {
    activeRows += `
      <tr>
        <td>${id}</td>
        <td>
          <form action="/delete" method="POST" style="margin:0;">
            <input type="hidden" name="userId" value="${id}">
            <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
            <button type="submit" style="background:red; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Terminate</button>
          </form>
        </td>
      </tr>`;
  });

  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `
      <tr>
        <td>${id}</td>
        <td>
          <form action="/manual-activate" method="POST" style="margin:0;">
            <input type="hidden" name="userId" value="${id}">
            <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
            <button type="submit" style="background:green; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Activate Bot</button>
          </form>
        </td>
      </tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f4f4f4;">
      <div style="max-width:700px; margin:auto; background:white; padding:30px; border-radius:15px; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
        <h1 style="border-bottom:2px solid #eee; padding-bottom:10px;">🛡️ Control Center</h1>
        
        <h3>Pending Activations (Waiting for Payment)</h3>
        <table border="1" width="100%" style="border-collapse:collapse; margin-bottom:30px;">
          <tr style="background:#f8f9fa;"><th>Temporary ID</th><th>Action</th></tr>
          ${pendingRows || '<tr><td colspan="2" style="text-align:center; padding:10px;">No pending users.</td></tr>'}
        </table>

        <h3>Live Trading Bots</h3>
        <table border="1" width="100%" style="border-collapse:collapse;">
          <tr style="background:#f8f9fa;"><th>User ID</th><th>Action</th></tr>
          ${activeRows || '<tr><td colspan="2" style="text-align:center; padding:10px;">No live bots.</td></tr>'}
        </table>

        <br><br>
        <a href="/" style="text-decoration:none; background:#2c3e50; color:white; padding:10px 20px; border-radius:5px;">Logout & Exit</a>
      </div>
    </body>
  `);
});

// 3. Manual Activation Logic
app.post('/manual-activate', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    await bootBot({ userId, apiToken: data.apiToken, market: 'R_100', active: true, minStake: 0.35 });
    pendingUsers.delete(userId);
    res.send(`<h2>✅ ${userId} Activated Successfully</h2><form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Back to Admin</button></form>`);
  } else {
    res.send("Error during activation.");
  }
});

// 4. Termination Logic
app.post('/delete', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && bots.has(userId)) {
    const bot = bots.get(userId);
    if (bot.user?.ws) bot.user.ws.terminate();
    bots.delete(userId);
  }
  res.redirect('/');
});

/* ================= STARTUP ================= */
app.listen(PORT, () => {
  console.log(`🌐 Multi-tenant Server Live on port ${PORT}`);
  if (fs.existsSync(usersFilePath)) {
    const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    (usersData.users || []).filter(u => u.active).forEach(u => bootBot(u));
  }
  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
  }
});
