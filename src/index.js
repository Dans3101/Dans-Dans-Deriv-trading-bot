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
  const session = new UserSession(userData);
  const bot = new DerivBot(session);
  bot.connect();
  bots.set(userData.userId, bot);
}

/* ================= UI GENERATORS ================= */
function generateStaffPerformanceTable() {
  if (bots.size === 0) return '<tr><td colspan="5" style="text-align:center; padding:15px;">No active bots.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = bot.user?.currentBalance || 0;
    const profit = (balance - (bot.user?.startBalance || balance)).toFixed(2);
    const color = profit >= 0 ? "#27ae60" : "#e74c3c";
    rows += `<tr><td><b>${id}</b></td><td>$${Number(balance).toFixed(2)}</td><td style="color:${color};">$${profit}</td><td>🟢 Live</td>
    <td><form action="/delete" method="POST" style="margin:0;"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button type="submit" style="background:#ff4757; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;">Eliminate</button></form></td></tr>`;
  });
  return rows;
}

function generateUserStats(shortId) {
    let userData = null;
    bots.forEach((bot, id) => { if (id.endsWith(shortId)) userData = bot; });
    if (!userData) return `<div style="color:red; padding:10px;">Bot not found for ID ending in ${shortId}</div>`;
    const profit = (userData.user.currentBalance - userData.user.startBalance).toFixed(2);
    return `<div style="text-align:left;"><b>ID:</b> ${userData.user.userId}<br><b>Balance:</b> $${userData.user.currentBalance}<br><b>Profit:</b> ${profit}<br><b>Trades:</b> ${userData.user.tradesToday || 0}</div>`;
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
        body { font-family: sans-serif; background: #f4f7f6; text-align: center; padding: 20px; }
        .card { background: white; max-width: 450px; margin: auto; padding: 25px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
        input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
        .btn { background: #d91e18; color: white; padding: 15px; width: 100%; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; }
        .track-btn { background: #2c3e50; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Dans-Dans Bot</h1>
        <div style="background:#e8f5e9; color:#2e7d32; padding:8px; border-radius:50px; display:inline-block; font-weight:bold; margin-bottom:15px;">💰 ${SUB_PRICE} / Week</div>
        
        ${trackId ? `<div style="background:#eee; padding:15px; border-radius:10px; margin-bottom:15px;">${generateUserStats(trackId)}</div>` : ''}

        <form action="/payment-page" method="POST">
          <input type="text" name="apiToken" placeholder="Deriv API Token" required>
          <input type="number" name="manualStake" placeholder="Enter Stake (e.g. 0.35)" step="0.01" min="0.35" required>
          <button type="submit" class="btn">Connect & Pay</button>
        </form>

        <hr style="margin:20px 0; border:0; border-top:1px solid #eee;">
        
        <form action="/" method="GET">
          <input type="text" name="trackId" placeholder="Enter last 4 digits of ID">
          <button type="submit" class="btn track-btn">Track My Bot</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/payment-page', (req, res) => {
  const { apiToken, manualStake } = req.body;
  const tempId = `User_${Math.floor(1000 + Math.random() * 9000)}`;
  pendingUsers.set(tempId, { apiToken, manualStake: parseFloat(manualStake) });
  res.send(`
    <div style="font-family:sans-serif; text-align:center; padding:50px;">
      <h2>Payment Required</h2>
      <p>Send <b>${SUB_PRICE}</b> to <b>${PAYMENT_NUMBER}</b></p>
      <p>Your ID: <b>${tempId}</b></p>
      <a href="${HELP_LINK}" style="background:#2c3e50; color:white; padding:15px; text-decoration:none; border-radius:10px;">I've Paid - Activate</a>
    </div>
  `);
});

app.get('/admin-login', (req, res) => {
  res.send(`<form action="/admin-portal" method="POST" style="text-align:center; margin-top:100px;">
    <input type="password" name="password" placeholder="Admin Password">
    <button type="submit">Login</button>
  </form>`);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");
  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `<tr><td>${id} (Stake: ${data.manualStake})</td><td>
    <form action="/manual-activate" method="POST"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Approve</button></form></td></tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px;">
      <script>setTimeout(() => { document.getElementById('refresh-form').submit(); }, 10000);</script>
      <form id="refresh-form" action="/admin-portal" method="POST" style="display:none;"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"></form>
      <h2>Staff Portal</h2>
      <div style="display:grid; grid-template-columns: 1fr 2fr; gap:20px;">
        <table border="1" width="100%"><tr><th>Pending</th><th>Action</th></tr>${pendingRows}</table>
        <table border="1" width="100%"><tr><th>User</th><th>Balance</th><th>Profit</th><th>Status</th><th>Action</th></tr>${generateStaffPerformanceTable()}</table>
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
    res.send("Activated. <a href='/admin-login'>Back</a>");
  }
});

app.post('/delete', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && bots.has(userId)) {
    const bot = bots.get(userId);
    if (bot.user?.ws) bot.user.ws.terminate();
    bots.delete(userId);
  }
  res.send("Deleted. <a href='/admin-login'>Back</a>");
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
