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
  if (bots.size === 0) return '<tr><td colspan="6" style="text-align:center; padding:10px;">No active bots.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const profit = (bot.user.currentBalance - (bot.user.startBalance || bot.user.currentBalance)).toFixed(2);
    rows += `<tr>
      <td><b>${id}</b></td>
      <td>$${bot.user.currentBalance.toFixed(2)}</td>
      <td style="color:${profit >= 0 ? 'green':'red'}; font-weight:bold;">$${profit}</td>
      <td>${generateDigitGraph(bot)}</td>
      <td>
        <form action="/update-stake" method="POST" style="margin:0; display:flex; gap:5px;">
          <input type="hidden" name="userId" value="${id}">
          <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
          <input type="number" name="newStake" step="0.01" value="${bot.user.manualStake}" style="width:60px; padding:2px;">
          <button style="background:#2ecc71; color:white; border:none; border-radius:3px; cursor:pointer; font-size:11px;">Set</button>
        </form>
      </td>
      <td>
        <form action="/delete" method="POST" style="margin:0;">
          <input type="hidden" name="userId" value="${id}">
          <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
          <button style="background:#ff4757; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Stop</button>
        </form>
      </td>
    </tr>`;
  });
  return rows;
}

/* ================= ROUTES ================= */

// 1. Home Page with Token Instructions
app.get('/', (req, res) => {
  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f4f7f6;">
      <div style="background:white; max-width:450px; margin:auto; padding:30px; border-radius:15px; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
        <h2 style="text-align:center; color:#d91e18;">Dans-Dans Bot</h2>
        
        <div style="background:#fff3f3; padding:15px; border-radius:10px; margin-bottom:20px; text-align:left; font-size:13px; border-left:4px solid #d91e18;">
          <b style="color:#d91e18;">How to get your API Token:</b><br>
          1. Log in to <b>Deriv.com</b><br>
          2. Go to <b>Account Settings</b><br>
          3. Select <b>API Token</b> from the sidebar<br>
          4. Create a token with <b>"Read"</b> and <b>"Trade"</b> scopes<br>
          5. Copy that token and paste it below.
        </div>

        <form action="/payment-page" method="POST">
          <label style="display:block; text-align:left; font-size:12px; margin-bottom:5px;">API Token</label>
          <input name="apiToken" placeholder="Paste your token here" required style="width:100%; padding:12px; margin-bottom:15px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box;">
          
          <label style="display:block; text-align:left; font-size:12px; margin-bottom:5px;">Initial Stake ($)</label>
          <input name="manualStake" type="number" step="0.01" placeholder="Minimum 0.35" required style="width:100%; padding:12px; margin-bottom:15px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box;">
          
          <button style="width:100%; padding:15px; background:#d91e18; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer; font-size:16px;">Connect & Proceed to Payment</button>
        </form>
        <a href="/admin-login" style="display:block; margin-top:20px; color:#aaa; font-size:12px; text-decoration:none; text-align:center;">Staff Portal</a>
      </div>
    </body>
  `);
});

app.post('/payment-page', (req, res) => {
  const id = `User_${Math.floor(1000 + Math.random()*9000)}`;
  pendingUsers.set(id, req.body);
  res.send(`
    <div style="text-align:center; padding:50px; font-family:sans-serif;">
      <h2>Confirm Payment</h2>
      <p style="font-size:18px;">Pay <b>100 KSH</b> to M-PESA: <b style="color:#27ae60;">${PAYMENT_NUMBER}</b></p>
      <div style="background:#eee; padding:15px; border-radius:10px; display:inline-block;">
        Your Registration ID: <b>${id}</b>
      </div>
      <p>Click below after paying to inform the admin.</p>
      <a href="https://bit.ly/4tJbxpH" style="display:inline-block; background:#2c3e50; color:white; padding:15px 30px; text-decoration:none; border-radius:10px; font-weight:bold;">I Have Paid</a>
    </div>
  `);
});

app.get('/admin-login', (req, res) => {
  res.send(`<form action="/admin-portal" method="POST" style="text-align:center; margin-top:100px; font-family:sans-serif;">
    <h3>Staff Login</h3>
    <input type="password" name="password" placeholder="Admin Password" style="padding:10px; border-radius:5px; border:1px solid #ddd;"><br><br>
    <button style="padding:10px 20px; background:#2c3e50; color:white; border:none; border-radius:5px; cursor:pointer;">Enter Portal</button>
  </form>`);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");
  let pendingRows = "";
  pendingUsers.forEach((v, k) => {
    pendingRows += `<tr><td>${k} ($${v.manualStake})</td><td><form action="/manual-activate" method="POST"><input type="hidden" name="userId" value="${k}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Approve</button></form></td></tr>`;
  });
  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f0f2f5;">
      <script>setTimeout(() => { document.getElementById('refresh-form').submit(); }, 15000);</script>
      <form id="refresh-form" action="/admin-portal" method="POST" style="display:none;"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"></form>
      
      <h2 style="color:#2c3e50;">🛡️ Management Dashboard</h2>
      <div style="display:grid; grid-template-columns: 1fr 3fr; gap:20px;">
        <div style="background:white; padding:15px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
            <h3>Pending Activation</h3>
            <table border="1" width="100%" style="border-collapse:collapse; text-align:left;">
                <tr style="background:#eee;"><th>User ID</th><th>Action</th></tr>
                ${pendingRows || '<tr><td colspan="2">None</td></tr>'}
            </table>
        </div>

        <div style="background:white; padding:15px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
            <h3>Active Bots</h3>
            <table border="1" width="100%" style="border-collapse:collapse; text-align:left;">
                <tr style="background:#eee;"><th>User</th><th>Balance</th><th>Profit</th><th>Digits</th><th>Adj. Stake</th><th>Action</th></tr>
                ${generateStaffTable()}
            </table>
        </div>
      </div>
    </body>
  `);
});

// NEW ROUTE: Update Stake on the fly
app.post('/update-stake', (req, res) => {
    const { userId, newStake, password } = req.body;
    if (password === ADMIN_PASSWORD && bots.has(userId)) {
        const bot = bots.get(userId);
        bot.user.manualStake = parseFloat(newStake);
        console.log(`[System] Updated stake for ${userId} to $${newStake}`);
    }
    res.redirect(307, '/admin-portal');
});

app.post('/manual-activate', (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    const bot = new DerivBot(new UserSession({ ...data, userId }));
    bot.connect();
    // Bot registers itself in the constructor, but we ensure it's in the Map here
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
