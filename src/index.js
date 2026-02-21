import 'dotenv/config';
import express from 'express';
import { DerivBot, bots } from './bot/DerivBot.js';
// Removed UserSession import to pass data directly for simplicity

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const PAYMENT_NUMBER = "0713811622"; 
const pendingUsers = new Map(); 

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* ================= UI HELPERS ================= */

function generateDigitGraph(bot) {
  if (!bot.digitMonitor || !bot.digitMonitor.getStats) return '...';
  const { percentages } = bot.digitMonitor.getStats();
  let html = '<div style="display:flex; align-items:flex-end; height:30px; gap:2px; background:#eee; padding:2px; border-radius:4px; width:100px;">';
  percentages.forEach((pct) => {
    const color = pct < 9 ? '#27ae60' : (pct > 13 ? '#e74c3c' : '#7f8c8d');
    html += `<div style="flex:1; height:${Math.max(pct*2, 2)}px; background:${color};"></div>`;
  });
  return html + '</div>';
}

/* ================= ROUTES ================= */

app.get('/', (req, res) => {
  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f4f7f6; text-align:center;">
      <div style="background:white; max-width:400px; margin:auto; padding:30px; border-radius:15px; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
        <h2 style="color:#d91e18;">Dans-Dans Trading Bot</h2>
        <form action="/payment-page" method="POST">
          <input name="apiToken" placeholder="Deriv API Token" required style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;">
          <input name="manualStake" type="number" step="0.01" placeholder="Initial Stake ($)" required style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;">
          <button style="width:100%; padding:15px; background:#d91e18; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">Activate Bot</button>
        </form>
        <p style="font-size:13px; color:#666; margin-top:15px;">Already active? <a href="/user-check" style="color:#d91e18;">Check My Bot Status</a></p>
        <a href="/admin-login" style="display:block; margin-top:20px; color:#aaa; font-size:11px; text-decoration:none;">Staff Portal</a>
      </div>
    </body>
  `);
});

app.get('/user-check', (req, res) => {
  res.send(`
    <body style="font-family:sans-serif; padding:50px; text-align:center; background:#f4f7f6;">
      <h3>Enter your User ID to view Status</h3>
      <form action="/dashboard" method="GET">
        <input name="id" placeholder="User_1234" required style="padding:12px; border-radius:8px; border:1px solid #ddd;">
        <button style="padding:12px; background:#2c3e50; color:white; border:none; border-radius:8px; cursor:pointer;">View Dashboard</button>
      </form>
    </body>
  `);
});

app.get('/dashboard', (req, res) => {
  const bot = bots.get(req.query.id);
  if (!bot) return res.send("<h3>Bot not found or not yet approved.</h3><a href='/'>Go Back</a>");
  const profit = (bot.user.currentBalance - (bot.user.startBalance || bot.user.currentBalance)).toFixed(2);
  res.send(`
    <body style="font-family:sans-serif; padding:20px; text-align:center;">
      <h2>User Dashboard (${req.query.id})</h2>
      <p>Balance: <b>$${bot.user.currentBalance.toFixed(2)}</b> | Profit: <b>$${profit}</b></p>
      <form action="/update-stake-user" method="POST">
        <input type="hidden" name="userId" value="${req.query.id}">
        <input type="number" name="newStake" step="0.01" value="${bot.user.manualStake}" style="width:70px;">
        <button>Update Stake</button>
      </form>
      <br><a href="/">Logout</a>
    </body>
  `);
});

// ADMIN PORTAL - RESTORED APPROVAL TABLE
app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");
  
  // 1. Generate Pending Table Rows
  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `<tr>
      <td>${id} <br><small>Stake: $${data.manualStake}</small></td>
      <td>
        <form action="/manual-activate" method="POST">
          <input type="hidden" name="userId" value="${id}">
          <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
          <button style="background:#2ecc71; color:white; border:none; padding:5px; border-radius:3px;">Approve</button>
        </form>
      </td>
    </tr>`;
  });

  // 2. Generate Active Bots Table Rows
  let activeRows = "";
  bots.forEach((bot, id) => {
    const profit = (bot.user.currentBalance - (bot.user.startBalance || bot.user.currentBalance)).toFixed(2);
    activeRows += `<tr>
      <td>${id}</td>
      <td>$${bot.user.currentBalance.toFixed(2)}</td>
      <td style="color:${profit >= 0 ? 'green':'red'}">$${profit}</td>
      <td>${generateDigitGraph(bot)}</td>
      <td>
        <form action="/delete" method="POST">
          <input type="hidden" name="userId" value="${id}">
          <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
          <button style="background:#e74c3c; color:white; border:none; padding:5px; border-radius:3px;">Stop</button>
        </form>
      </td>
    </tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px;">
      <div style="display:flex; justify-content:space-between;">
        <h2>🛡️ Staff Dashboard</h2>
        <a href="/admin-login" style="padding:10px; background:#666; color:white; text-decoration:none; border-radius:5px;">Logout</a>
      </div>
      
      <div style="display:grid; grid-template-columns: 1fr 2fr; gap:20px; margin-top:20px;">
        <div>
          <h3>Pending (Awaiting Payment)</h3>
          <table border="1" width="100%" style="border-collapse:collapse;">
            <tr style="background:#eee;"><th>User</th><th>Action</th></tr>
            ${pendingRows || '<tr><td colspan="2">No pending users</td></tr>'}
          </table>
        </div>
        <div>
          <h3>Active Trading Bots</h3>
          <table border="1" width="100%" style="border-collapse:collapse;">
            <tr style="background:#eee;"><th>User</th><th>Balance</th><th>Profit</th><th>Stats</th><th>Action</th></tr>
            ${activeRows || '<tr><td colspan="5">No active bots</td></tr>'}
          </table>
        </div>
      </div>
    </body>
  `);
});

/* ================= LOGIC ROUTES ================= */

app.post('/manual-activate', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    const bot = new DerivBot({
      userId: userId,
      apiToken: data.apiToken,
      manualStake: data.manualStake,
      market: 'R_100'
    });
    bot.connect();
    pendingUsers.delete(userId);
  }
  res.redirect(307, '/admin-portal'); // Redirect back with password to keep session
});

app.post('/payment-page', (req, res) => {
  const id = `User_${Math.floor(1000 + Math.random()*9000)}`;
  pendingUsers.set(id, req.body);
  res.send(`
    <div style="text-align:center; padding:50px; font-family:sans-serif;">
      <h2>Confirm Payment</h2>
      <p>Pay 100 KSH to: <b>${PAYMENT_NUMBER}</b></p>
      <p>Provide ID: <b>${id}</b></p>
      <a href="https://bit.ly/4tJbxpH" style="background:black; color:white; padding:10px; text-decoration:none;">I Have Paid</a>
    </div>
  `);
});

app.get('/admin-login', (req, res) => {
  res.send(`<form action="/admin-portal" method="POST" style="text-align:center; margin-top:100px;"><input type="password" name="password" placeholder="Password"><button>Login</button></form>`);
});

app.post('/update-stake-user', (req, res) => {
  const { userId, newStake } = req.body;
  if (bots.has(userId)) {
    bots.get(userId).user.manualStake = parseFloat(newStake);
  }
  res.redirect(`/dashboard?id=${userId}`);
});

app.post('/delete', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    const bot = bots.get(req.body.userId);
    if (bot?.user?.ws) bot.user.ws.terminate();
    bots.delete(req.body.userId);
  }
  res.redirect(307, '/admin-portal');
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
