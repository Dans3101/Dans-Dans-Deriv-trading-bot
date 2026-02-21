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

// Middleware to handle form data and static redirection
app.use(express.urlencoded({ extended: true }));

/* ================= BOT STORAGE ================= */
export const bots = new Map(); // userId → DerivBot instance

/* ================= HELPER: START A BOT ================= */
async function bootBot(userData) {
  try {
    // Check if bot already exists in memory
    if (bots.has(userData.userId)) {
      console.log(`[System] Bot ${userData.userId} already running.`);
      return;
    }

    const apiToken = userData.apiToken?.startsWith('ENV:')
      ? process.env[userData.apiToken.replace('ENV:', '')]
      : userData.apiToken;

    if (!apiToken) {
      console.error(`❌ Missing API token for ${userData.userId}`);
      return;
    }

    const session = new UserSession({ ...userData, apiToken });
    const bot = new DerivBot(session);

    bot.connect();
    bots.set(userData.userId, bot);
    console.log(`✅ Bot instance activated: ${userData.userId}`);
  } catch (err) {
    console.error(`❌ Failed to boot ${userData.userId}:`, err.message);
  }
}

/* ================= LOAD SAVED USERS ================= */
function loadExistingUsers() {
  try {
    if (fs.existsSync(usersFilePath)) {
      const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
      const activeUsers = (usersData.users || []).filter(u => u.active);
      console.log(`📂 Found ${activeUsers.length} saved users in JSON. Loading...`);
      activeUsers.forEach(u => bootBot(u));
    }
  } catch (err) {
    console.warn('⚠️ No existing users found to auto-load.');
  }
}

/* ================= DASHBOARD UI ================= */
function generateBotTable() {
  if (bots.size === 0) return '<tr><td colspan="4" style="text-align:center; padding:30px; color:#999;">No active trading bots.</td></tr>';
  
  let rows = "";
  bots.forEach((bot, id) => {
    const market = bot.user?.market || "N/A";
    const status = bot.user?.ws?.readyState === 1 ? "🟢 Online" : "🟠 Connecting...";
    
    rows += `
      <tr>
        <td><b>${id}</b></td>
        <td><span class="badge">${market}</span></td>
        <td>${status}</td>
        <td>
          <form action="/delete" method="POST" style="margin:0;">
            <input type="hidden" name="userId" value="${id}" />
            <button type="submit" class="btn-stop">Stop Bot</button>
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
      <title>Deriv Bot | Dashboard</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; padding: 20px; color: #333; }
        .container { max-width: 800px; margin: auto; }
        .card { background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 25px; margin-bottom: 20px; }
        h2 { margin-top: 0; border-bottom: 2px solid #eee; padding-bottom: 10px; color: #2c3e50; }
        .input-group { display: flex; gap: 10px; margin: 20px 0; }
        input { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 5px; }
        .btn-start { background: #27ae60; color: white; border: none; padding: 12px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th { text-align: left; padding: 12px; background: #fafafa; border-bottom: 2px solid #eee; }
        td { padding: 12px; border-bottom: 1px solid #eee; }
        .badge { background: #d1ecf1; color: #0c5460; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .btn-stop { background: #e74c3c; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
        .footer-info { font-size: 13px; color: #7f8c8d; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h2>🚀 Connect New Bot</h2>
          <form action="/connect" method="POST" class="input-group">
            <input type="text" name="apiToken" placeholder="Enter Deriv API Token" required />
            <button type="submit" class="btn-start">Launch</button>
          </form>
        </div>

        <div class="card">
          <h2>📊 Active Bots (${bots.size})</h2>
          <table>
            <thead>
              <tr>
                <th>User ID</th>
                <th>Market</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${generateBotTable()}
            </tbody>
          </table>
          <div class="footer-info">Mistakenly added bots can be stopped here instantly.</div>
        </div>
      </div>
    </body>
    </html>
  `);
});

/* ================= ROUTES ================= */

// Start a new bot via Web
app.post('/connect', async (req, res) => {
  const { apiToken } = req.body;
  if (!apiToken) return res.redirect('/');

  const shortToken = apiToken.substring(0, 4);
  const userId = `web_${shortToken}_${Math.floor(Math.random() * 999)}`;

  await bootBot({
    userId,
    apiToken,
    market: 'R_100', // Default for new web users
    active: true,
    minStake: 0.35
  });

  res.redirect('/');
});

// Stop and delete a bot
app.post('/delete', (req, res) => {
  const { userId } = req.body;

  if (bots.has(userId)) {
    const botToStop = bots.get(userId);
    
    // Stop the connection
    if (botToStop.user?.ws) {
      botToStop.user.ws.terminate();
      console.log(`[System] WebSocket terminated for ${userId}`);
    }

    // Clear loops
    if (botToStop.tradeLoop) clearInterval(botToStop.tradeLoop);

    // Remove from memory
    bots.delete(userId);
    console.log(`🗑️ Bot ${userId} removed from system.`);
  }

  res.redirect('/');
});

/* ================= INIT SERVER ================= */
app.listen(PORT, () => {
  console.log(`🌐 Server live on port ${PORT}`);
  
  // 1. Boot saved users from users.json
  loadExistingUsers();

  // 2. Start Telegram Admin
  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
    console.log(`✅ Telegram Admin Bot linked to active sessions.`);
  }
});
