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

app.get('/', (req, res) => {
  res.send('✅ Deriv trading bot is running on Render');
});

app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

/* ================= ENV CHECK ================= */
if (!process.env.DERIV_API_TOKEN) {
  console.error('❌ DERIV_API_TOKEN is missing in environment variables');
  process.exit(1);
}

/* ================= LOAD USERS ================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '../users.json');

let usersData;
try {
  const raw = fs.readFileSync(usersFilePath, 'utf8');
  usersData = JSON.parse(raw);
} catch (err) {
  console.error('❌ Failed to load users.json:', err.message);
  process.exit(1);
}

const users = (usersData.users || []).filter(u => u.active);
if (!users.length) {
  console.error('❌ No active users found in users.json');
  process.exit(1);
}

console.log(`📂 Loaded ${users.length} active user(s) from users.json`);

/* ================= BOT STORAGE ================= */
export const bots = new Map(); // userId → DerivBot instance

/* ================= START BOTS ================= */
async function startBots() {
  console.log('🚀 Starting Deriv bots...');

  for (const userData of users) {
    try {
      const apiToken =
        userData.apiToken?.startsWith('ENV:')
          ? process.env[userData.apiToken.replace('ENV:', '')]
          : userData.apiToken;

      if (!apiToken) {
        console.error(`❌ Missing API token for ${userData.userId}`);
        continue;
      }

      const session = new UserSession({ ...userData, apiToken });
      const bot = new DerivBot(session);
      await bot.connect();

      bots.set(userData.userId, bot);
      console.log(`✅ Bot started for ${userData.userId}`);
    } catch (err) {
      console.error(`❌ Failed to start bot for ${userData.userId}:`, err.message);
    }
  }

  // Start Telegram admin **once**
  if (!global.telegramStarted) {
    global.telegramStarted = true;
    console.log('🤖 Starting Telegram Admin...');
    listenTelegramAdmin(bots);
  }
}

setTimeout(startBots, 5000);