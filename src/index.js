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

/* ================= MULTI-USER BOT MANAGER ================= */

class BotManager {
  constructor() {
    this.bots = new Map(); // userId -> DerivBot
  }

  addUser(userData) {
    if (this.bots.has(userData.userId)) {
      console.log(`⚠️ Bot already exists for ${userData.userId}`);
      return;
    }

    const session = new UserSession(userData);
    const bot = new DerivBot(session);

    this.bots.set(userData.userId, bot);
    console.log(`➕ Registered bot for ${userData.userId}`);
  }

  startBot(userId) {
    const bot = this.bots.get(userId);
    if (!bot) {
      console.log(`❌ No bot found for ${userId}`);
      return;
    }

    bot.connect();
    console.log(`▶️ Started bot for ${userId}`);
  }

  stopBot(userId) {
    const bot = this.bots.get(userId);
    if (!bot) return;

    if (bot.user.ws) bot.user.ws.close();
    this.bots.delete(userId);
    console.log(`🛑 Stopped bot for ${userId}`);
  }

  startAll() {
    for (const userId of this.bots.keys()) {
      this.startBot(userId);
    }
  }

  listUsers() {
    return Array.from(this.bots.keys());
  }
}

/* ================= USERS CONFIG ================= */

const users = [
  {
    userId: 'user_001',
    apiToken: process.env.DERIV_API_TOKEN,
    market: 'R_75'
  },

  // 👇 You can add more users later like this:
  /*
  {
    userId: 'user_002',
    apiToken: process.env.DERIV_API_TOKEN_2,
    market: 'R_100'
  }
  */
];

/* ================= BOT STARTUP ================= */

const botManager = new BotManager();

// Register all users
users.forEach(userData => botManager.addUser(userData));

// Start all bots after Render boots
setTimeout(() => {
  console.log("🚀 Starting all bots...");
  botManager.startAll();
  console.log("👥 Active bots:", botManager.listUsers());
}, 3000);