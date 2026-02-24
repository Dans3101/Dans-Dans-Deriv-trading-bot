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

  const session = new UserSession({ ...userData, apiToken });
  const bot = new DerivBot(session);
  
  // PERSISTENCE: Restore saved stats into the live instance
  bot.user.totalProfit = userData.totalProfit || 0;
  bot.user.tradesToday = userData.tradesToday || 0;
  bot.user.active = true;

  bot.connect();
  bots.set(userData.userId, bot);
  console.log(`🚀 Bot Instance Created/Restored: ${userData.userId}`);
}

/* ================= UI GENERATORS ================= */

function generateStaffPerformanceTable() {
  if (bots.size === 0) return '<tr><td colspan="5" style="text-align:center; padding:15px; color:#888;">No active trading sessions.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = Number(bot.user?.currentBalance || 0);
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

function generateUserStats(shortId) {
    let userData = null;
    let foundId = null;
    bots.forEach((bot, id) => { if (id.endsWith(shortId)) { userData = bot; foundId = id; } });

    if (!userData) return `<div style="color:#d91e18; padding:10px; font-weight:bold;">❌ No active bot found.</div>`;

    const balance = Number(userData.user?.currentBalance || 0);
    const lifetimeProfit = Number(userData.user?.totalProfit || 0).toFixed(2);
    const color = lifetimeProfit >= 0 ? "#27ae60" : "#e74c3c";

    return `
        <div style="background:#f8f9fa; border-radius:12px; padding:20px; text-align:left; border:1px solid #eee;">
            <h4 style="margin:0 0 15px 0; color:#2c3e50;">Bot: ${foundId}</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div><small>Balance</small><br><b style="font-size:18px;">$${balance.toFixed(2)}</b></div>
                <div><small>Lifetime Profit</small><br><b style="font-size:18px; color:${color};">$${lifetimeProfit}</b></div>
                <div><small>Trades</small><br><b style="font-size:18px;">${userData.user.tradesToday}</b></div>
                <div><small>Status</small><br><b style="color:#27ae60;">ACTIVE</b></div>
            </div>
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
        ${trackId ? `<div class="card">${generateUserStats(trackId)}</div>` : ''}
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
    <div style="max-width:400px; margin: 60px auto; font-family: sans-serif; text-align:center; padding:30px; background:white; border-radius:20px;">
      <h2>Payment Details</h2>
      <p>Send <b>${SUB_PRICE}</b> to M-Pesa:</p>
      <h1>${PAYMENT_NUMBER}</h1>
      <p>Your ID: <b>${tempId}</b></p>
      <a href="${HELP_LINK}">✅ I Have Paid</a>
    </div>
  `);
});

/* ================= LOGIC HANDLERS ================= */

app.post('/manual-activate', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    
    // Create the persistent user object
    const newUser = { 
        userId, 
        apiToken: data.apiToken, 
        market: 'R_100', 
        active: true, 
        totalProfit: 0, 
        tradesToday: 0 
    };

    // 1. Save to users.json immediately so it survives a deploy
    try {
        let currentData = { users: [] };
        if (fs.existsSync(usersFilePath)) {
            currentData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        }
        currentData.users = currentData.users.filter(u => u.userId !== userId);
        currentData.users.push(newUser);
        fs.writeFileSync(usersFilePath, JSON.stringify(currentData, null, 2));
    } catch (e) { console.error("Error saving user:", e); }

    // 2. Start the bot
    await bootBot(newUser);
    pendingUsers.delete(userId);
    res.send(`Activated! <form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Back</button></form>`);
  }
});

app.post('/delete', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const bot = bots.get(userId);
    if (bot?.user?.ws) bot.user.ws.terminate();
    bots.delete(userId);
    
    // Remove from JSON file so it doesn't restart on deploy
    try {
        let currentData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        currentData.users = currentData.users.filter(u => u.userId !== userId);
        fs.writeFileSync(usersFilePath, JSON.stringify(currentData, null, 2));
    } catch (e) {}
  }
  res.redirect('/');
});

/* ================= STARTUP ================= */
app.listen(PORT, () => {
  console.log(`🌐 Server Running: Port ${PORT}`);
  
  // PERSISTENCE ENGINE: Reload all bots from the file on start
  if (fs.existsSync(usersFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
      if (data.users && data.users.length > 0) {
        console.log(`♻️ Reloading ${data.users.length} bots from storage...`);
        data.users.forEach(u => {
           if (u.active) bootBot(u); 
        });
      }
    } catch (e) { console.error("Startup Reload Error:", e); }
  }

  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
  }
});
