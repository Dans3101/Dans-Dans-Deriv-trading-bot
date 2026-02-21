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

app.use(express.urlencoded({ extended: true }));

/* ================= BOT STORAGE ================= */
export const bots = new Map(); // userId → DerivBot instance

/* ================= FUNCTION: START A SINGLE BOT ================= */
async function bootBot(userData) {
  try {
    const apiToken = userData.apiToken?.startsWith('ENV:')
      ? process.env[userData.apiToken.replace('ENV:', '')]
      : userData.apiToken;

    if (!apiToken) return console.error(`❌ Missing API token for ${userData.userId}`);

    const session = new UserSession({ ...userData, apiToken });
    const bot = new DerivBot(session);

    bot.connect();
    bots.set(userData.userId, bot);
    console.log(`✅ Bot active: ${userData.userId}`);
  } catch (err) {
    console.error(`❌ Failed to boot ${userData.userId}:`, err.message);
  }
}

/* ================= LOAD EXISTING USERS FROM JSON ================= */
function loadExistingUsers() {
  try {
    if (fs.existsSync(usersFilePath)) {
      const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
      const activeUsers = (usersData.users || []).filter(u => u.active);
      
      console.log(`📂 Found ${activeUsers.length} saved users. Starting...`);
      activeUsers.forEach(u => bootBot(u));
    }
  } catch (err) {
    console.warn('⚠️ No existing users loaded from JSON:', err.message);
  }
}

/* ================= WEB INTERFACE ================= */
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Deriv Bot Dashboard</title>
        <style>
          body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; }
          .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); width: 350px; text-align: center; }
          input { width: 100%; padding: 12px; margin: 15px 0; border: 1px solid #ddd; border-radius: 6px; }
          button { width: 100%; padding: 12px; background: #d91e18; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🤖 Trade Hub</h2>
          <p>Active Bots: <b>${bots.size}</b></p>
          <form action="/connect" method="POST">
            <input type="text" name="apiToken" placeholder="Enter Deriv API Token" required />
            <button type="submit">Launch Bot</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.post('/connect', async (req, res) => {
  const { apiToken } = req.body;
  const userId = `web_${apiToken.substring(0, 4)}_${Math.floor(Math.random() * 999)}`;
  
  await bootBot({
    userId,
    apiToken,
    market: 'R_100',
    active: true,
    minStake: 0.35
  });

  res.send(`<h2>✅ Bot ${userId} Started!</h2><a href="/">Back</a>`);
});

/* ================= INITIALIZATION ================= */
app.listen(PORT, () => {
  console.log(`🌐 Server live on port ${PORT}`);
  
  // 1. Load the "disappeared" users back in
  loadExistingUsers();

  // 2. Start Telegram Admin
  if (!global.telegramStarted) {
    global.telegramStarted = true;
    listenTelegramAdmin(bots);
  }
});
