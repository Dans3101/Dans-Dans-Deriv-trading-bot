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
const ADMIN_PHONE = "+2547XXXXXXXX"; // Update with your M-Pesa number
const WHATSAPP_LINK = "https://wa.me/2547XXXXXXXX"; // Update with your WhatsApp link
const AUTOMATIC_PAYMENT_URL = "https://your-payment-gateway.com/pay"; // Your gateway link

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* ================= STORAGE ================= */
export const bots = new Map(); 
const pendingUsers = new Map(); // Users waiting for payment completion

/* ================= BOT BOOT LOGIC ================= */
async function bootBot(userData) {
  if (bots.has(userData.userId)) return;
  
  const apiToken = userData.apiToken?.startsWith('ENV:') 
    ? process.env[userData.apiToken.replace('ENV:', '')] 
    : userData.apiToken;

  if (!apiToken) return;

  const session = new UserSession({ ...userData, apiToken });
  const bot = new DerivBot(session);
  bot.connect();
  bots.set(userData.userId, bot);
  console.log(`🚀 Bot officially started for: ${userData.userId}`);
}

/* ================= UI GENERATORS ================= */

function generatePublicTable() {
  if (bots.size === 0) return '<tr><td colspan="4" style="text-align:center; padding:20px;">No bots currently trading.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = bot.user?.currentBalance || 0;
    const startBalance = bot.user?.startBalance || balance;
    const profit = (balance - startBalance).toFixed(2);
    const profitColor = profit >= 0 ? "#27ae60" : "#e74c3c";
    const status = bot.user?.ws?.readyState === 1 ? "🟢 Live" : "⚪ Connecting";

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

/* ================= WEB ROUTES ================= */

// 1. Home Page (Connection + Public Tracking)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Deriv Bot Hub | Home</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; padding: 20px; }
        .container { max-width: 850px; margin: auto; }
        .card { background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); padding: 25px; margin-bottom: 20px; }
        h1 { color: #2c3e50; font-size: 24px; }
        .input-group { display: flex; gap: 10px; margin-top: 15px; }
        input { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 8px; }
        .btn-pay { background: #d91e18; color: white; border: none; padding: 12px 25px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { text-align: left; padding: 12px; background: #f8f9fa; border-bottom: 2px solid #eee; }
        td { padding: 12px; border-bottom: 1px solid #eee; }
        .admin-link { display: block; text-align: center; margin-top: 40px; color: #999; text-decoration: none; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>🤖 Connect & Trade</h1>
          <p>Enter your API Token to begin. You will be redirected to the payment page.</p>
          <form action="/select-payment" method="POST" class="input-group">
            <input type="text" name="apiToken" placeholder="Paste Deriv API Token" required />
            <button type="submit" class="btn-pay">Continue to Payment</button>
          </form>
        </div>

        <div class="card">
          <h2>📊 Live Performance</h2>
          <table>
            <thead>
              <tr><th>Bot ID</th><th>Balance</th><th>Profit</th><th>Status</th></tr>
            </thead>
            <tbody>${generatePublicTable()}</tbody>
          </table>
        </div>
        <a href="/admin-login" class="admin-link">Administrator Login</a>
      </div>
    </body>
    </html>
  `);
});

// 2. Payment Selection Page
app.post('/select-payment', (req, res) => {
  const { apiToken } = req.body;
  const tempId = `User_${Math.floor(1000 + Math.random() * 9000)}`;
  pendingUsers.set(tempId, { apiToken });

  res.send(`
    <div style="max-width:450px; margin: 80px auto; font-family: sans-serif; background:white; padding:30px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.1); text-align:center;">
      <h2 style="color:#2c3e50;">Choose Payment Method</h2>
      <p>ID: <b>${tempId}</b></p>
      <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
      
      <form action="/handle-payment" method="POST">
        <input type="hidden" name="userId" value="${tempId}">
        
        <button name="method" value="auto" style="width:100%; padding:15px; background:#27ae60; color:white; border:none; border-radius:10px; margin-bottom:10px; font-weight:bold; cursor:pointer;">
          💳 Automatic (Instant Activation)
        </button>
        
        <button name="method" value="manual_ke" style="width:100%; padding:15px; background:#3498db; color:white; border:none; border-radius:10px; margin-bottom:10px; font-weight:bold; cursor:pointer;">
          🇰🇪 Manual (Kenya - M-Pesa)
        </button>
        
        <button name="method" value="manual_intl" style="width:100%; padding:15px; background:#9b59b6; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">
          🌍 Manual (International - WhatsApp)
        </button>
      </form>
      <p style="font-size:12px; color:#7f8c8d; margin-top:20px;">Manual payments require admin approval via WhatsApp.</p>
    </div>
  `);
});

// 3. Handle Payment Redirects
app.post('/handle-payment', (req, res) => {
  const { userId, method } = req.body;
  const data = pendingUsers.get(userId);

  if (method === 'auto') {
    res.redirect(`${AUTOMATIC_PAYMENT_URL}?userId=${userId}&token=${data.apiToken}`);
  } else if (method === 'manual_ke') {
    res.send(`<div style="text-align:center; padding:50px; font-family:sans-serif;">
      <h2>M-Pesa Activation</h2>
      <p>Send your payment to <b>${ADMIN_PHONE}</b>.</p>
      <p>Then send your ID <b>${userId}</b> and M-Pesa code to Admin on WhatsApp.</p>
      <a href="${WHATSAPP_LINK}" style="background:#25D366; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Contact Admin</a>
    </div>`);
  } else {
    res.redirect(`${WHATSAPP_LINK}?text=Hello Admin, I want to activate my bot. My ID is ${userId}`);
  }
});

/* ================= ADMIN & WEBHOOKS ================= */

// Webhook for Automatic Payment Success
app.post('/payment-webhook', async (req, res) => {
  const { userId, status } = req.body; 
  if (status === 'success' && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    await bootBot({ userId, apiToken: data.apiToken, market: 'R_100', active: true, minStake: 0.35 });
    pendingUsers.delete(userId);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

// Admin Login & Control
app.get('/admin-login', (req, res) => {
  res.send(`<div style="max-width:300px; margin:100px auto; text-align:center; font-family:sans-serif;">
    <form action="/admin-portal" method="POST">
      <input type="password" name="password" placeholder="Admin Password" style="width:100%; padding:10px; margin-bottom:10px;">
      <button style="width:100%; padding:10px; background:#2c3e50; color:white; border:none;">Login</button>
    </form>
  </div>`);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");
  let rows = "";
  bots.forEach((bot, id) => {
    rows += `<tr><td>${id}</td><td>
      <form action="/delete" method="POST"><input type="hidden" name="userId" value="${id}">
      <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
      <button style="color:red;">Kill Bot</button></form></td></tr>`;
  });
  res.send(`<h2>🛡️ Admin Table</h2><table border="1" width="100%">${rows}</table><br><a href="/">Back</a>`);
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

/* ================= STARTUP ================= */
app.listen(PORT, () => {
  console.log(`🌐 Multi-tenant Bot Server live on port ${PORT}`);
  if (fs.existsSync(usersFilePath)) {
    const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    (usersData.users || []).filter(u => u.active).forEach(u => bootBot(u));
  }
  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
  }
});
