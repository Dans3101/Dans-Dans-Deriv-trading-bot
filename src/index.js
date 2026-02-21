import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { UserSession } from './users/userSession.js';
import { DerivBot, bots } from './bot/DerivBot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CONFIGURATION ================= */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const PAYMENT_NUMBER = "0713811622"; 
const HELP_LINK = "https://bit.ly/4tJbxpH"; 
const SUB_PRICE = "100 KSH";

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const pendingUsers = new Map(); 

/* ================= BOT BOOT LOGIC ================= */
async function bootBot(userData) {
  if (bots.has(userData.userId)) return;
  userData.manualStake = parseFloat(userData.manualStake) || 0.35;
  
  const session = new UserSession(userData);
  const bot = new DerivBot(session);
  bot.connect();
  bots.set(userData.userId, bot);
}

/* ================= UI GENERATORS ================= */

function generateDigitGraph(bot) {
  if (!bot.digitMonitor || !bot.digitMonitor.getStats) return '<small>Awaiting Data...</small>';
  
  const stats = bot.digitMonitor.getStats();
  let graphHtml = '<div style="display: flex; align-items: flex-end; height: 50px; gap: 2px; padding: 5px; background: #f0f0f0; border-radius: 4px; width:150px;">';
  
  stats.percentages.forEach((pct, digit) => {
    // Green if cold (good for Over), Red if hot
    const color = pct < 9 ? '#27ae60' : (pct > 13 ? '#e74c3c' : '#bdc3c7');
    const height = Math.min(Math.max(pct * 2, 2), 45); 
    graphHtml += `<div style="flex: 1; height: ${height}px; background: ${color};" title="Digit ${digit}: ${pct}%"></div>`;
  });
  
  graphHtml += '</div>';
  return graphHtml;
}

function generateStaffPerformanceTable() {
  if (bots.size === 0) return '<tr><td colspan="5" style="text-align:center; padding:15px; color:#888;">No active bots.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = bot.user?.currentBalance || 0;
    const profit = (balance - (bot.user?.startBalance || balance)).toFixed(2);
    const profitColor = profit >= 0 ? "#27ae60" : "#e74c3c";
    
    rows += `
      <tr>
        <td style="padding:10px;"><b>${id}</b><br><small>Stake: $${bot.user.manualStake}</small></td>
        <td style="font-weight:bold;">$${Number(balance).toFixed(2)}</td>
        <td style="color:${profitColor}; font-weight:bold;">$${profit}</td>
        <td>${generateDigitGraph(bot)}</td>
        <td>
          <form action="/delete" method="POST" style="margin:0;">
            <input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}">
            <button type="submit" style="background:#ff4757; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Stop</button>
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
      <title>Dans-Dans Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: sans-serif; background: #f4f7f6; padding: 20px; text-align: center; }
        .card { background: white; max-width: 400px; margin: auto; padding: 25px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
        input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
        .btn { background: #d91e18; color: white; padding: 15px; width: 100%; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Dans-Dans Bot</h1>
        <form action="/payment-page" method="POST">
          <input type="text" name="apiToken" placeholder="Deriv API Token" required>
          <input type="number" name="manualStake" placeholder="Enter Stake (e.g. 0.35)" step="0.01" min="0.35" required>
          <button type="submit" class="btn">Connect & Pay</button>
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
    <div style="font-family:sans-serif; text-align:center; padding:50px;">
      <h2>Confirm Payment</h2>
      <p>Pay <b>${SUB_PRICE}</b> to: <b>${PAYMENT_NUMBER}</b></p>
      <p>Your ID: <b>${tempId}</b></p>
      <a href="${HELP_LINK}" style="background:#2c3e50; color:white; padding:15px; text-decoration:none; border-radius:10px;">I Have Paid</a>
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
    pendingRows += `<tr><td>${id} ($${data.manualStake})</td><td>
    <form action="/manual-activate" method="POST"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Approve</button></form></td></tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f0f2f5;">
      <script>setTimeout(() => { document.getElementById('refresh-form').submit(); }, 8000);</script>
      <form id="refresh-form" action="/admin-portal" method="POST" style="display:none;"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"></form>
      <div style="max-width:1000px; margin:auto; background:white; padding:20px; border-radius:12px;">
        <h2>🛡️ Staff Dashboard</h2>
        <div style="display:grid; grid-template-columns: 1fr 2fr; gap:20px;">
          <table border="1" width="100%" style="border-collapse:collapse;">
            <tr style="background:#eee;"><th>Pending</th><th>Action</th></tr>
            ${pendingRows || '<tr><td colspan="2">None</td></tr>'}
          </table>
          <table border="1" width="100%" style="border-collapse:collapse;">
            <tr style="background:#eee;"><th>User</th><th>Balance</th><th>Profit</th><th>Digit Distribution</th><th>Action</th></tr>
            ${generateStaffPerformanceTable()}
          </table>
        </div>
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
