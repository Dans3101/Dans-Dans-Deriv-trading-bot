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

  // Persistence: Ensure stats are passed into the session
  const session = new UserSession({
    ...userData,
    apiToken,
    totalProfit: userData.totalProfit || 0,
    tradesToday: userData.tradesToday || 0,
    currentMultiplier: userData.currentMultiplier || 1
  });

  const bot = new DerivBot(session);
  bot.connect();
  bots.set(userData.userId, bot);
  console.log(`🚀 Bot Restored & Active: ${userData.userId}`);
}

/* ================= UI GENERATORS ================= */

function generateStaffPerformanceTable() {
  if (bots.size === 0) return '<tr><td colspan="5" style="text-align:center; padding:15px; color:#888;">No active sessions.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = Number(bot.user?.currentBalance || 0).toFixed(2);
    const profit = Number(bot.user?.totalProfit || 0).toFixed(2);
    const color = profit >= 0 ? "#27ae60" : "#e74c3c";
    
    rows += `
      <tr>
        <td><b>${id}</b></td>
        <td>$${balance}</td>
        <td style="color:${color}; font-weight:bold;">$${profit}</td>
        <td>🟢 Live</td>
        <td>
          <form action="/delete" method="POST" style="margin:0;">
            <input type="hidden" name="userId" value="${id}">
            <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
            <button type="submit" style="background:#ff4757; color:white; border:none; padding:5px; cursor:pointer; border-radius:4px;">Kill</button>
          </form>
        </td>
      </tr>`;
  });
  return rows;
}

/* ================= WEB ROUTES ================= */

app.get('/', (req, res) => {
  res.send(`<h1>Dans-Dans Bot</h1><p>Running on Port ${PORT}</p><a href="/admin-login">Staff Login</a>`);
});

app.get('/admin-login', (req, res) => {
  res.send(`
    <div style="max-width:300px; margin: 100px auto; text-align:center; font-family:sans-serif;">
      <h2>Staff Portal</h2>
      <form action="/admin-portal" method="POST">
        <input type="password" name="password" placeholder="Admin Password" required style="width:100%; padding:10px; margin-bottom:10px;">
        <button type="submit" style="width:100%; padding:10px; background:#2c3e50; color:white; border:none;">Login</button>
      </form>
    </div>
  `);
});

app.post('/admin-portal', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.send("Access Denied");

  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `<tr><td>${id}</td><td><form action="/manual-activate" method="POST"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button type="submit">Approve</button></form></td></tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f4f7f6;">
      <script>setTimeout(() => { document.getElementById('refresh-form').submit(); }, 12000);</script>
      <form id="refresh-form" action="/admin-portal" method="POST" style="display:none;"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"></form>
      <div style="max-width:1000px; margin:auto; background:white; padding:25px; border-radius:15px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
        <h1 style="color:#2c3e50;">🛡️ Staff Dashboard <small style="font-size:12px; color:blue;">(Auto-Refreshing)</small></h1>
        <div style="display:grid; grid-template-columns: 1fr 2fr; gap:20px;">
          <div style="border-right:1px solid #eee; padding-right:20px;">
            <h3>Pending Activation</h3>
            <table border="1" width="100%" style="border-collapse:collapse;">${pendingRows || '<tr><td>None</td></tr>'}</table>
          </div>
          <div>
            <h3>Live Performance</h3>
            <table border="1" width="100%" style="border-collapse:collapse; text-align:left;">
              <tr style="background:#f8f9fa;"><th>User ID</th><th>Balance</th><th>Profit</th><th>Status</th><th>Action</th></tr>
              ${generateStaffPerformanceTable()}
            </table>
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
    
    const newUser = { 
        userId, 
        apiToken: data.apiToken, 
        market: 'R_100', 
        active: true, 
        totalProfit: 0, 
        tradesToday: 0,
        currentMultiplier: 1 
    };

    // SAVE TO FILE (Survival)
    try {
        let currentData = { users: [] };
        if (fs.existsSync(usersFilePath)) {
            currentData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        }
        currentData.users = currentData.users.filter(u => u.userId !== userId);
        currentData.users.push(newUser);
        fs.writeFileSync(usersFilePath, JSON.stringify(currentData, null, 2));
    } catch (e) { console.error("File Save Error:", e); }

    await bootBot(newUser);
    pendingUsers.delete(userId);
    res.send(`Success! <form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Back</button></form>`);
  }
});

app.post('/delete', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const bot = bots.get(userId);
    if (bot?.user?.ws) bot.user.ws.terminate();
    bots.delete(userId);
    
    // Remove from JSON so it stops reconnecting
    try {
        let currentData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        currentData.users = currentData.users.filter(u => u.userId !== userId);
        fs.writeFileSync(usersFilePath, JSON.stringify(currentData, null, 2));
    } catch (e) {}
  }
  res.redirect('/admin-login');
});

/* ================= STARTUP ================= */
app.listen(PORT, () => {
  console.log(`🌐 Server Running: Port ${PORT}`);
  
  if (fs.existsSync(usersFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
      if (data.users) data.users.forEach(u => { if (u.active) bootBot(u); });
    } catch (e) { console.error("Startup Reload Error:", e); }
  }

  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
  }
});
