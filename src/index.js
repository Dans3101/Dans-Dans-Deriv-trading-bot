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
const DURATION = "7 Days (1 Week)";

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
  bot.connect();
  bots.set(userData.userId, bot);
}

/* ================= UI GENERATORS ================= */
function generateStaffPerformanceTable() {
  if (bots.size === 0) return '<tr><td colspan="4" style="text-align:center; padding:15px;">No active bots trading.</td></tr>';
  let rows = "";
  bots.forEach((bot, id) => {
    const balance = bot.user?.currentBalance || 0;
    const startBalance = bot.user?.startBalance || balance;
    const profit = (balance - startBalance).toFixed(2);
    const color = profit >= 0 ? "#27ae60" : "#e74c3c";
    rows += `<tr><td><b>${id}</b></td><td>$${Number(balance).toFixed(2)}</td><td style="color:${color};font-weight:bold;">${profit >= 0 ? '+' : ''}${profit}</td><td>🟢 Online</td></tr>`;
  });
  return rows;
}

/* ================= WEB ROUTES ================= */

// --- ENHANCED USER HOME PAGE ---
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dans-Dans Deriv Bot | Professional Trading</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        :root { --primary: #d91e18; --dark: #2c3e50; --bg: #f8f9fa; }
        body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); margin: 0; padding: 0; color: #333; }
        .hero { background: var(--dark); color: white; padding: 40px 20px; text-align: center; }
        .container { max-width: 600px; margin: -30px auto 40px; padding: 0 15px; }
        .card { background: white; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); padding: 30px; margin-bottom: 20px; }
        .price-tag { display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 8px 16px; border-radius: 50px; font-weight: bold; margin-bottom: 15px; }
        h1 { margin: 0 0 10px; font-size: 28px; }
        .btn-connect { background: var(--primary); color: white; border: none; padding: 16px; border-radius: 12px; cursor: pointer; font-weight: bold; width: 100%; font-size: 16px; transition: 0.3s; }
        .btn-connect:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(217,30,24,0.3); }
        .steps { text-align: left; background: #fdfdfd; padding: 20px; border-radius: 12px; border: 1px solid #eee; margin-top: 20px; }
        .step-item { display: flex; gap: 12px; margin-bottom: 12px; font-size: 14px; align-items: flex-start; }
        .step-num { background: var(--dark); color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; }
        .help-btn { display: block; text-align: center; margin-top: 20px; color: var(--dark); font-weight: 600; text-decoration: none; border: 2px solid var(--dark); padding: 12px; border-radius: 12px; }
        .footer { text-align: center; padding-bottom: 30px; font-size: 12px; color: #bbb; }
        input { width: 100%; padding: 14px; border: 2px solid #eee; border-radius: 10px; box-sizing: border-box; font-size: 15px; margin: 10px 0; outline: none; transition: 0.2s; }
        input:focus { border-color: var(--primary); }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1>Dans-Dans Trading Bot</h1>
        <p>Advanced Algorithmic Profits</p>
      </div>

      <div class="container">
        <div class="card" style="text-align:center;">
          <div class="price-tag">💰 Only ${SUB_PRICE} per week</div>
          <form action="/payment-page" method="POST">
            <input type="text" name="apiToken" placeholder="Enter Deriv API Token" required>
            <button type="submit" class="btn-connect">Connect & Launch Bot</button>
          </form>

          <div class="steps">
            <h4 style="margin-top:0;">How to get your API Token:</h4>
            <div class="step-item"><div class="step-num">1</div> <div>Log in to your <b>Deriv</b> account.</div></div>
            <div class="step-item"><div class="step-num">2</div> <div>Go to <b>Settings</b> > <b>API Token</b>.</div></div>
            <div class="step-item"><div class="step-num">3</div> <div>Select <b>"Read"</b> and <b>"Trade"</b> scopes.</div></div>
            <div class="step-item"><div class="step-num">4</div> <div>Name it "MyBot" and click <b>Create</b>.</div></div>
          </div>
          
          <a href="${HELP_LINK}" class="help-btn" target="_blank">Chat with Admin for Help</a>
        </div>

        <div class="footer">
          <a href="/admin-login" style="color:inherit; text-decoration:none;">Staff Portal</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// --- PAYMENT PAGE ---
app.post('/payment-page', (req, res) => {
  const { apiToken } = req.body;
  const tempId = `User_${Math.floor(1000 + Math.random() * 9000)}`;
  pendingUsers.set(tempId, { apiToken });

  res.send(`
    <body style="font-family:sans-serif; background:#f4f7f6; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
      <div style="max-width:400px; background:white; padding:30px; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.1); text-align:center;">
        <h2 style="color:#2c3e50; margin-bottom:5px;">Activate Your Session</h2>
        <p style="color:#666; margin-bottom:25px;">Subscription: <b>${DURATION}</b></p>
        
        <div style="background:#f1f8f3; padding:20px; border-radius:15px; border: 1px dashed #27ae60; margin-bottom:20px;">
          <span style="font-size:13px; color:#27ae60; font-weight:bold;">PAY VIA M-PESA</span>
          <h1 style="margin:10px 0; color:#1a1a1a; letter-spacing:1px;">${PAYMENT_NUMBER}</h1>
          <span style="font-size:18px; font-weight:bold;">Amount: ${SUB_PRICE}</span>
        </div>

        <p style="font-size:14px; line-height:1.5;">Copy the M-Pesa message and your ID: <b style="background:#eee; padding:2px 5px;">${tempId}</b> then click the button below.</p>
        
        <a href="${HELP_LINK}" style="display:block; background:#2c3e50; color:white; padding:16px; text-decoration:none; border-radius:12px; font-weight:bold; margin-top:20px;">✅ I've Paid - Activate Now</a>
        <br><a href="/" style="color:#999; text-decoration:none; font-size:12px;">Go Back</a>
      </div>
    </body>
  `);
});

/* ================= STAFF PORTAL (RESTORED & UPGRADED) ================= */

app.get('/admin-login', (req, res) => {
  res.send(`
    <div style="max-width:350px; margin: 100px auto; font-family: sans-serif; text-align:center; padding:30px; border-radius:15px; background:white; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
      <h2>Staff Login</h2>
      <form action="/admin-portal" method="POST">
        <input type="password" name="password" placeholder="Admin Password" style="width:100%; padding:12px; margin-bottom:10px; border:1px solid #ddd; border-radius:8px;" required>
        <button type="submit" style="width:100%; padding:12px; background:#2c3e50; color:white; border:none; border-radius:8px; cursor:pointer;">Access Portal</button>
      </form>
    </div>
  `);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");

  let pendingRows = "";
  pendingUsers.forEach((data, id) => {
    pendingRows += `<tr><td>${id}</td><td><form action="/manual-activate" method="POST" style="margin:0;"><input type="hidden" name="userId" value="${id}"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button style="background:green; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">Approve & Start</button></form></td></tr>`;
  });

  res.send(`
    <body style="font-family:sans-serif; padding:20px; background:#f0f2f5;">
      <div style="max-width:800px; margin:auto; background:white; padding:30px; border-radius:15px; box-shadow:0 5px 15px rgba(0,0,0,0.05);">
        <h1 style="color:#2c3e50;">Staff Control Panel</h1>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
          <div>
            <h3>Pending Payments</h3>
            <table border="1" width="100%" style="border-collapse:collapse;">
              <tr style="background:#eee;"><th>ID</th><th>Action</th></tr>
              ${pendingRows || '<tr><td colspan="2" style="text-align:center; padding:10px;">None</td></tr>'}
            </table>
          </div>
          <div>
            <h3>Live Market Performance</h3>
            <table border="1" width="100%" style="border-collapse:collapse;">
              <tr style="background:#eee;"><th>User</th><th>Balance</th><th>Profit</th></tr>
              ${generateStaffPerformanceTable()}
            </table>
          </div>
        </div>

        <hr style="margin:40px 0; border:0; border-top:1px solid #eee;">
        <div style="text-align:center;"><a href="/" style="background:#2c3e50; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Logout</a></div>
      </div>
    </body>
  `);
});

app.post('/manual-activate', async (req, res) => {
  const { userId, password } = req.body;
  if (password === ADMIN_PASSWORD && pendingUsers.has(userId)) {
    const data = pendingUsers.get(userId);
    // User is approved for 1 week (7 days)
    await bootBot({ userId, apiToken: data.apiToken, market: 'R_100', active: true, minStake: 0.35 });
    pendingUsers.delete(userId);
    res.send(`<h3>Account ${userId} activated for 1 week!</h3><form action="/admin-portal" method="POST"><input type="hidden" name="password" value="${ADMIN_PASSWORD}"><button>Return to Staff Portal</button></form>`);
  }
});

/* ================= STARTUP ================= */
app.listen(PORT, () => {
  console.log(`🌐 Server active on port ${PORT}`);
  if (fs.existsSync(usersFilePath)) {
    const data = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    (data.users || []).filter(u => u.active).forEach(u => bootBot(u));
  }
  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
  }
});
