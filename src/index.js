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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

app.use(express.urlencoded({ extended: true }));

/* ================= BOT STORAGE ================= */
export const bots = new Map();

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
  if (bots.size === 0) return '<tr><td colspan="4" style="text-align:center; padding:20px;">No active trades.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = bot.user?.currentBalance || 0;
    const startBalance = bot.user?.startBalance || balance;
    const profit = (balance - startBalance).toFixed(2);
    const profitColor = profit >= 0 ? "#27ae60" : "#e74c3c";
    const status = bot.user?.ws?.readyState === 1 ? "🟢 Trading" : "⚪ Offline";

    rows += `
      <tr>
        <td><b>${id}</b></td>
        <td>$${Number(balance).toFixed(2)}</td>
        <td style="color: ${profitColor}; font-weight:bold;">${profit >= 0 ? '+' : ''}${profit}</td>
        <td>${status}</td>
      </tr>`;
  });
  return rows;
}

function generateAdminTable() {
  let rows = "";
  bots.forEach((bot, id) => {
    rows += `
      <tr>
        <td>${id}</td>
        <td>
          <form action="/delete" method="POST" style="margin:0;">
            <input type="hidden" name="userId" value="${id}" />
            <input type="password" name="password" placeholder="Admin Pass" required style="width:100px; padding:4px;">
            <button type="submit" style="background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer;">Stop</button>
          </form>
        </td>
      </tr>`;
  });
  return rows;
}

/* ================= ROUTES ================= */

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Deriv Bot Hub</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; color: #333; }
        .container { max-width: 800px; margin: auto; }
        .card { background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); padding: 25px; margin-bottom: 20px; }
        h1, h2 { color: #2c3e50; }
        .input-group { display: flex; gap: 10px; margin: 15px 0; }
        input { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 8px; }
        .btn-main { background: #3498db; color: white; border: none; padding: 12px 25px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; background: #fff; }
        th { text-align: left; padding: 12px; background: #f8f9fa; border-bottom: 2px solid #eee; }
        td { padding: 12px; border-bottom: 1px solid #eee; }
        .admin-section { margin-top: 50px; border-top: 1px dashed #ccc; padding-top: 20px; text-align: center; }
        .btn-admin { background: transparent; color: #999; border: 1px solid #ccc; padding: 8px 15px; border-radius: 5px; cursor: pointer; text-decoration: none; font-size: 12px; }
        .btn-admin:hover { background: #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>🚀 Connect Your Account</h1>
          <p>Enter your Deriv API token to join the trading pool.</p>
          <form action="/connect" method="POST" class="input-group">
            <input type="text" name="apiToken" placeholder="Deriv API Token" required />
            <button type="submit" class="btn-main">Connect Bot</button>
          </form>
        </div>

        <div class="card">
          <h2>📊 Live Performance</h2>
          <table>
            <thead>
              <tr>
                <th>Bot ID</th>
                <th>Current Balance</th>
                <th>Today's Profit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${generatePublicTable()}
            </tbody>
          </table>
        </div>

        <div class="admin-section">
          <a href="/admin-panel" class="btn-admin">Administrator Login</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/admin-panel', (req, res) => {
  res.send(`
    <div style="max-width:400px; margin: 100px auto; font-family:sans-serif; text-align:center;">
      <h2>🛡️ Admin Access</h2>
      <form action="/admin-verify" method="POST">
        <input type="password" name="password" placeholder="Enter Admin Password" style="width:100%; padding:12px; margin-bottom:10px;" required />
        <button type="submit" style="width:100%; padding:12px; background:#2c3e50; color:white; border:none; cursor:pointer;">Login</button>
      </form>
      <br><a href="/">Back to Dashboard</a>
    </div>
  `);
});

app.post('/admin-verify', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.send(`
      <body style="font-family:sans-serif; padding:20px; background:#f4f4f4;">
        <div style="max-width:600px; margin:auto; background:white; padding:20px; border-radius:10px;">
          <h2>🛡️ Admin Control Panel</h2>
          <table style="width:100%; text-align:left; border-collapse:collapse;">
            <tr style="background:#eee;"><th>User ID</th><th>Action</th></tr>
            ${generateAdminTable()}
          </table>
          <br><a href="/">Logout</a>
        </div>
      </body>
    `);
  } else {
    res.send("Invalid Password. <a href='/admin-panel'>Try again</a>");
  }
});

app.post('/connect', async (req, res) => {
  const { apiToken } = req.body;
  const userId = `User_${Math.floor(1000 + Math.random() * 9000)}`;
  await bootBot({ userId, apiToken, market: 'R_100', active: true, minStake: 0.35 });
  res.redirect('/');
});

app.post('/delete', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && bots.has(userId)) {
    const bot = bots.get(userId);
    if (bot.user?.ws) bot.user.ws.terminate();
    bots.delete(userId);
  }
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`🌐 Bot running on port ${PORT}`);
  if (fs.existsSync(usersFilePath)) {
    const data = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    (data.users || []).filter(u => u.active).forEach(u => bootBot(u));
  }
  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
  }
});
