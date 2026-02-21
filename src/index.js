import 'dotenv/config';
import express from 'express';
import { DerivBot, bots } from './bot/DerivBot.js';
import { UserSession } from './users/userSession.js';

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

// 1. HOME PAGE
app.get('/', (req, res) => {
  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f4f7f6; text-align:center;">
      <div style="background:white; max-width:400px; margin:auto; padding:30px; border-radius:15px; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
        <h2 style="color:#d91e18;">Dans-Dans Trading Bot</h2>
        <div style="background:#fff3f3; padding:10px; border-radius:8px; margin-bottom:20px; font-size:12px; text-align:left; border-left:4px solid #d91e18;">
          <b>Setup:</b> Get your API Token from Deriv (Settings > API Token) with <b>Read</b> and <b>Trade</b> permissions.
        </div>
        <form action="/payment-page" method="POST">
          <input name="apiToken" placeholder="Deriv API Token" required style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;">
          <input name="manualStake" type="number" step="0.01" placeholder="Initial Stake ($)" required style="width:100%; padding:12px; margin-bottom:10px; border-radius:8px; border:1px solid #ddd;">
          <button style="width:100%; padding:15px; background:#d91e18; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">Activate Bot</button>
        </form>
        <hr style="margin:20px 0; opacity:0.2;">
        <p style="font-size:13px; color:#666;">Already active? <a href="/user-check" style="color:#d91e18;">Check My Bot Status</a></p>
        <a href="/admin-login" style="display:block; margin-top:20px; color:#aaa; font-size:11px; text-decoration:none;">Staff Portal</a>
      </div>
    </body>
  `);
});

// 2. USER STATUS CHECK (Where they go to adjust stake)
app.get('/user-check', (req, res) => {
  res.send(`
    <body style="font-family:sans-serif; padding:50px; text-align:center; background:#f4f7f6;">
      <h3>Enter your User ID to view Status</h3>
      <form action="/dashboard" method="GET">
        <input name="id" placeholder="User_1234" required style="padding:12px; border-radius:8px; border:1px solid #ddd;">
        <button style="padding:12px; background:#2c3e50; color:white; border:none; border-radius:8px; cursor:pointer;">View Dashboard</button>
      </form>
      <br><a href="/" style="color:#666;">Back Home</a>
    </body>
  `);
});

// 3. INDIVIDUAL USER DASHBOARD
app.get('/dashboard', (req, res) => {
  const bot = bots.get(req.query.id);
  if (!bot) return res.send("<h3>Bot not found or not yet approved.</h3><a href='/'>Go Back</a>");

  const profit = (bot.user.currentBalance - (bot.user.startBalance || bot.user.currentBalance)).toFixed(2);
  const statusColor = bot.user.active ? '#27ae60' : '#e74c3c';

  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f4f7f6; text-align:center;">
      <div style="background:white; max-width:400px; margin:auto; padding:30px; border-radius:15px; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">My Bot</h2>
          <span style="background:${statusColor}; color:white; padding:4px 10px; border-radius:20px; font-size:12px;">${bot.user.active ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        <hr>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:20px 0;">
          <div style="background:#f9f9f9; padding:15px; border-radius:10px;">
            <small>Balance</small><br><b>$${bot.user.currentBalance.toFixed(2)}</b>
          </div>
          <div style="background:#f9f9f9; padding:15px; border-radius:10px;">
            <small>Total Profit</small><br><b style="color:${profit >= 0 ? 'green':'red'}">$${profit}</b>
          </div>
        </div>

        <form action="/update-stake-user" method="POST" style="background:#eee; padding:15px; border-radius:10px;">
          <label style="font-size:13px;">Adjust My Stake ($)</label><br><br>
          <input type="hidden" name="userId" value="${req.query.id}">
          <input type="number" name="newStake" step="0.01" value="${bot.user.manualStake}" style="width:80px; padding:10px; border-radius:5px; border:1px solid #ccc;">
          <button style="padding:10px; background:#27ae60; color:white; border:none; border-radius:5px; cursor:pointer;">Update Stake</button>
        </form>
        
        <br><a href="/" style="color:#aaa; font-size:12px;">Logout / Exit</a>
      </div>
    </body>
  `);
});

// 4. ADMIN PORTAL (With Logout)
app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");
  
  let botRows = "";
  bots.forEach((bot, id) => {
    const profit = (bot.user.currentBalance - (bot.user.startBalance || bot.user.currentBalance)).toFixed(2);
    botRows += `<tr>
      <td>${id}</td>
      <td>$${bot.user.currentBalance.toFixed(2)}</td>
      <td style="color:${profit >= 0 ? 'green':'red'}">$${profit}</td>
      <td>${generateDigitGraph(bot)}</td>
      <td>$${bot.user.manualStake}</td>
      <td><form action="/delete" method="POST"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Stop</button></form></td>
    </tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>🛡️ Staff Dashboard</h2>
        <a href="/admin-login" style="padding:10px 20px; background:#666; color:white; text-decoration:none; border-radius:5px;">Logout</a>
      </div>
      <table border="1" width="100%" style="border-collapse:collapse; margin-top:20px;">
        <tr style="background:#eee;"><th>User</th><th>Balance</th><th>Profit</th><th>Digits</th><th>Stake</th><th>Action</th></tr>
        ${botRows || '<tr><td colspan="6" style="text-align:center;">No active bots</td></tr>'}
      </table>
    </body>
  `);
});

/* ================= LOGIC ROUTES ================= */

app.post('/update-stake-user', (req, res) => {
  const { userId, newStake } = req.body;
  if (bots.has(userId)) {
    const bot = bots.get(userId);
    bot.user.manualStake = parseFloat(newStake);
  }
  res.redirect(`/dashboard?id=${userId}`);
});

app.post('/payment-page', (req, res) => {
  const id = `User_${Math.floor(1000 + Math.random()*9000)}`;
  pendingUsers.set(id, req.body);
  res.send(`<div style="text-align:center; padding:50px;"><h2>Confirm Payment</h2><p>Pay 100 KSH to <b>${PAYMENT_NUMBER}</b></p><p>Your ID: <b>${id}</b></p><a href="https://bit.ly/4tJbxpH">I Have Paid</a></div>`);
});

app.get('/admin-login', (req, res) => {
  res.send(`<form action="/admin-portal" method="POST" style="text-align:center; margin-top:100px;"><input type="password" name="password" placeholder="Password"><button>Login</button></form>`);
});

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
  res.redirect(307, '/admin-portal');
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
