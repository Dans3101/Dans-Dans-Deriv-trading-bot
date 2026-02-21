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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123"; // Set this in Render Env Vars

app.use(express.urlencoded({ extended: true }));

/* ================= BOT STORAGE ================= */
export const bots = new Map();

/* ================= HELPER: START A BOT ================= */
async function bootBot(userData) {
  try {
    if (bots.has(userData.userId)) return;

    const apiToken = userData.apiToken?.startsWith('ENV:')
      ? process.env[userData.apiToken.replace('ENV:', '')]
      : userData.apiToken;

    if (!apiToken) return;

    const session = new UserSession({ ...userData, apiToken });
    const bot = new DerivBot(session);

    bot.connect();
    bots.set(userData.userId, bot);
    console.log(`✅ Bot active: ${userData.userId}`);
  } catch (err) {
    console.error(`❌ Failed to boot ${userData.userId}:`, err.message);
  }
}

/* ================= DASHBOARD UI WITH BALANCES ================= */
function generateBotTable() {
  if (bots.size === 0) return '<tr><td colspan="5" style="text-align:center; padding:30px; color:#999;">No active trading bots.</td></tr>';
  
  let rows = "";
  bots.forEach((bot, id) => {
    const market = bot.user?.market || "N/A";
    const status = bot.user?.ws?.readyState === 1 ? "🟢 Online" : "🟠 Connecting...";
    // Get real-time balance from the bot instance
    const balance = bot.user?.currentBalance ? `$${Number(bot.user.currentBalance).toFixed(2)}` : "Loading...";
    
    rows += `
      <tr>
        <td><b>${id}</b></td>
        <td><span class="badge">${market}</span></td>
        <td style="font-weight: bold; color: #2c3e50;">${balance}</td>
        <td>${status}</td>
        <td>
          <form action="/delete" method="POST" style="margin:0; display: flex; gap: 5px;">
            <input type="hidden" name="userId" value="${id}" />
            <input type="password" name="password" placeholder="Admin Pass" style="width:80px; padding:4px; font-size:10px;" required />
            <button type="submit" class="btn-stop">Remove</button>
          </form>
        </td>
      </tr>`;
  });
  return rows;
}

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Admin Trade Hub</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; padding: 20px; }
        .container { max-width: 950px; margin: auto; }
        .card { background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 25px; margin-bottom: 20px; }
        h2 { margin-top: 0; color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .input-group { display: flex; gap: 10px; margin: 20px 0; }
        input { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 5px; }
        .btn-start { background: #27ae60; color: white; border: none; padding: 12px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th { text-align: left; padding: 12px; background: #fafafa; border-bottom: 2px solid #eee; color: #666; }
        td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
        .badge { background: #d1ecf1; color: #0c5460; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .btn-stop { background: #e74c3c; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; }
        .error-msg { color: #e74c3c; font-weight: bold; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h2>🚀 Connect Account</h2>
          <form action="/connect" method="POST" class="input-group">
            <input type="text" name="apiToken" placeholder="Deriv API Token" required />
            <button type="submit" class="btn-start">Connect Bot</button>
          </form>
        </div>

        <div class="card">
          <h2>🛡️ Admin Control Panel</h2>
          <table>
            <thead>
              <tr>
                <th>User ID</th>
                <th>Market</th>
                <th>Live Balance</th>
                <th>Status</th>
                <th>Admin Action</th>
              </tr>
            </thead>
            <tbody>
              ${generateBotTable()}
            </tbody>
          </table>
        </div>
      </div>
    </body>
    </html>
  `);
});

/* ================= SECURE ROUTES ================= */

app.post('/connect', async (req, res) => {
  const { apiToken } = req.body;
  const userId = `web_${apiToken.substring(0, 4)}_${Math.floor(Math.random() * 999)}`;
  await bootBot({ userId, apiToken, market: 'R_100', active: true, minStake: 0.35 });
  res.redirect('/');
});

app.post('/delete', (req, res) => {
  const { userId, password } = req.body;

  // Verify Admin Authority
  if (password !== ADMIN_PASSWORD) {
    return res.send("<script>alert('Unauthorized: Invalid Admin Password'); window.location='/';</script>");
  }

  if (bots.has(userId)) {
    const botToStop = bots.get(userId);
    if (botToStop.user?.ws) botToStop.user.ws.terminate();
    if (botToStop.tradeLoop) clearInterval(botToStop.tradeLoop);
    bots.delete(userId);
    console.log(`🗑️ Admin removed bot: ${userId}`);
  }
  res.redirect('/');
});

/* ================= INIT ================= */
app.listen(PORT, () => {
  console.log(`🌐 Admin Server live on port ${PORT}`);
  if (fs.existsSync(usersFilePath)) {
    const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    (usersData.users || []).filter(u => u.active).forEach(u => bootBot(u));
  }
  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
  }
});
