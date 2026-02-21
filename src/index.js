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
  let html = '<div style="display:flex; align-items:flex-end; height:40px; gap:2px; background:#eee; padding:4px; border-radius:4px; width:120px;">';
  percentages.forEach((pct) => {
    const color = pct < 9 ? '#27ae60' : (pct > 13 ? '#e74c3c' : '#7f8c8d');
    html += `<div style="flex:1; height:${Math.max(pct*2, 2)}px; background:${color};"></div>`;
  });
  return html + '</div>';
}

function generateStaffTable() {
  if (bots.size === 0) return '<tr><td colspan="5">No active bots.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const profit = (bot.user.currentBalance - (bot.user.startBalance || bot.user.currentBalance)).toFixed(2);
    rows += `<tr>
      <td>${id}<br><small>$${bot.user.manualStake}</small></td>
      <td>$${bot.user.currentBalance.toFixed(2)}</td>
      <td style="color:${profit >= 0 ? 'green':'red'}">$${profit}</td>
      <td>${generateDigitGraph(bot)}</td>
      <td><form action="/delete" method="POST"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Stop</button></form></td>
    </tr>`;
  });
  return rows;
}

/* ================= ROUTES ================= */
app.get('/', (req, res) => {
  res.send(`
    <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f4f7f6;">
      <div style="background:white; max-width:350px; margin:auto; padding:30px; border-radius:15px; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
        <h2>Dans-Dans Bot</h2>
        <form action="/payment-page" method="POST">
          <input name="apiToken" placeholder="Deriv API Token" required style="width:100%; padding:10px; margin:5px 0;">
          <input name="manualStake" type="number" step="0.01" placeholder="Stake (e.g. 0.35)" required style="width:100%; padding:10px; margin:5px 0;">
          <button style="width:100%; padding:12px; background:#d91e18; color:white; border:none; border-radius:8px; cursor:pointer;">Start Bot</button>
        </form>
        <a href="/admin-login" style="display:block; margin-top:20px; color:#aaa; font-size:12px; text-decoration:none;">Staff Portal</a>
      </div>
    </body>
  `);
});

app.post('/payment-page', (req, res) => {
  const id = `User_${Math.floor(1000 + Math.random()*9000)}`;
  pendingUsers.set(id, req.body);
  res.send(`<div style="text-align:center; padding:50px;"><h2>Confirm Payment</h2><p>Pay 100 KSH to <b>${PAYMENT_NUMBER}</b></p><p>Your ID: <b>${id}</b></p><a href="https://bit.ly/4tJbxpH">I Have Paid</a></div>`);
});

app.get('/admin-login', (req, res) => {
  res.send(`<form action="/admin-portal" method="POST" style="text-align:center; margin-top:100px;"><input type="password" name="password" placeholder="Password"><button>Login</button></form>`);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");
  let pendingRows = "";
  pendingUsers.forEach((v, k) => {
    pendingRows += `<tr><td>${k}</td><td><form action="/manual-activate" method="POST"><input type="hidden" name="userId" value="${k}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Approve</button></form></td></tr>`;
  });
  res.send(`
    <body style="font-family:sans-serif; padding:20px;">
      <script>setTimeout(() => location.reload(), 10000);</script>
      <h2>🛡️ Staff Dashboard</h2>
      <div style="display:grid; grid-template-columns: 1fr 2fr; gap:20px;">
        <table border="1" width="100%" style="border-collapse:collapse;"><tr><th>Pending</th><th>Action</th></tr>${pendingRows}</table>
        <table border="1" width="100%" style="border-collapse:collapse;"><tr><th>User</th><th>Balance</th><th>Profit</th><th>Digits</th><th>Action</th></tr>${generateStaffTable()}</table>
      </div>
    </body>
  `);
});

app.post('/manual-activate', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    const bot = new DerivBot(new UserSession({ ...data, userId }));
    bot.connect();
    bots.set(userId, bot);
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
