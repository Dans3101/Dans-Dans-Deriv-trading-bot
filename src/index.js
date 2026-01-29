import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { UserSession } from './users/userSession.js';
import { DerivBot } from './bot/DerivBot.js';
import { listenTelegramAdmin } from './notifications/telegramAdmin.js';

/* ================= RENDER KEEP-ALIVE SERVER ================= */
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('✅ Deriv trading bot is running on Render'));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

/* ================= LOAD USERS ================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '../users.json');

let usersData;
try {
  usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
} catch (err) {
  console.error('❌ Failed to load users.json:', err.message);
  process.exit(1);
}

const users = (usersData.users || []).filter(u => u.active);
if (users.length === 0) {
  console.error('❌ No active users found in users.json');
  process.exit(1);
}
console.log(`📂 Loaded ${users.length} active user(s)`);

/* ================= BOT STORAGE ================= */
export const bots = new Map(); // userId → DerivBot instance

/* ================= START BOTS ================= */
async function startBots() {
  console.log('🚀 Starting Deriv bots...');

  for (const userData of users) {
    try {
      const apiToken = userData.apiToken?.startsWith('ENV:')
        ? process.env[userData.apiToken.replace('ENV:', '')]
        : userData.apiToken;

      if (!apiToken) {
        console.error(`❌ Missing API token for ${userData.userId}`);
        continue;
      }

      // Ensure market is set
      if (!userData.market) {
        userData.market = 'R_50';
        console.log(`[${userData.userId}] Market set to default: ${userData.market}`);
      }

      const session = new UserSession({ ...userData, apiToken });
      const bot = new DerivBot(session);

      // Await bot connection to ensure proper startup
      await new Promise(resolve => {
        bot.connect();
        bot.user.ws.on('open', resolve);
      });

      bots.set(userData.userId, bot);
      console.log(`✅ Bot started for ${userData.userId}`);
    } catch (err) {
      console.error(`❌ Failed to start bot for ${userData.userId}:`, err.message);
    }
  }

  // Start Telegram Admin only once
  if (!global.telegramStarted) {
    global.telegramStarted = true;
    console.log('🤖 Starting Telegram Admin...');
    listenTelegramAdmin(bots);
  }
}

// Delay slightly to allow server to fully initialize
setTimeout(startBots, 3000);