import 'dotenv/config';
import express from 'express';
import { UserSession } from './users/userSession.js';
import { DerivBot } from './bot/DerivBot.js';

/* ================= RENDER KEEP-ALIVE SERVER ================= */

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ Deriv trading bot is running on Render');
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

/* ================= ENV CHECK ================= */

if (!process.env.DERIV_API_TOKEN) {
  console.error('❌ DERIV_API_TOKEN is missing in environment variables');
  console.error('👉 Add it in Render Environment Variables');
  process.exit(1);
}

/* ================= USERS CONFIG ================= */

const users = [
  {
    userId: 'user_001',
    apiToken: process.env.DERIV_API_TOKEN,
    market: 'R_75'
  }
];

/* ================= BOT STARTUP ================= */

function startBots() {
  users.forEach(userData => {
    try {
      const session = new UserSession(userData);
      const bot = new DerivBot(session);
      bot.connect();
      console.log(`✅ Bot started for ${userData.userId}`);
    } catch (err) {
      console.error(`❌ Failed to start bot for ${userData.userId}`, err);
    }
  });
}

// Delay bot start slightly so Render server initializes first
setTimeout(startBots, 3000);