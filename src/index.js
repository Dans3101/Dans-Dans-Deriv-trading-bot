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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to handle form data
app.use(express.urlencoded({ extended: true }));

/* ================= BOT STORAGE ================= */
export const bots = new Map(); // userId → DerivBot instance

/* ================= WEB INTERFACE ================= */

// 1. The Prompt Page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Deriv Bot Connection</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
          .container { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
          h2 { color: #d91e18; margin-bottom: 10px; }
          input { width: 100%; padding: 12px; margin: 20px 0; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; font-size: 16px; }
          button { width: 100%; padding: 12px; background: #d91e18; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; }
          button:hover { background: #b91914; }
          p { color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Connect Your Bot</h2>
          <p>Enter your Deriv API Token to start your automated trading session.</p>
          <form action="/connect" method="POST">
            <input type="text" name="apiToken" placeholder="Paste your API Token here" required />
            <button type="submit">Start Bot Now</button>
          </form>
          <p>Don't have a token? Generate one in your Deriv settings with 'Trade' and 'Read' scopes.</p>
        </div>
      </body>
    </html>
  `);
});

// 2. The Connection Logic
app.post('/connect', async (req, res) => {
  const { apiToken } = req.body;

  if (!apiToken) return res.send("Error: Token is required.");

  // Use token as a unique identifier or create a random ID
  const userId = `user_${apiToken.substring(0, 5)}_${Math.floor(Math.random() * 1000)}`;

  if (bots.has(userId)) {
    return res.send("<h3>Bot is already running for this account.</h3><a href='/'>Back</a>");
  }

  try {
    const userData = {
      userId: userId,
      apiToken: apiToken,
      market: 'R_100', // Using your preferred Digit market
      active: true,
      stakePercent: 0.02,
      minStake: 0.35 // Setting the minimum we established earlier
    };

    const session = new UserSession(userData);
    const bot = new DerivBot(session);
    
    bot.connect();
    bots.set(userId, bot);

    console.log(`✅ Dynamic Bot started for ${userId}`);

    res.send(`
      <div style="text-align:center; padding: 50px; font-family: sans-serif;">
        <h2 style="color: green;">Success!</h2>
        <p>Your bot <b>${userId}</b> is now connected and analyzing the market.</p>
        <p>You can now close this window and monitor your Deriv platform.</p>
        <a href="/">Connect another account</a>
      </div>
    `);

    // Ensure Telegram Admin is updated with the new bot map
    if (global.telegramStarted) {
        listenTelegramAdmin(bots); 
    }

  } catch (err) {
    res.send(`Error starting bot: ${err.message}`);
  }
});

app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

/* ================= START TELEGRAM ADMIN ================= */
// We start this once at launch; it will listen to the 'bots' Map which we update dynamically
if (!global.telegramStarted) {
  global.telegramStarted = true;
  console.log('🤖 Starting Telegram Admin...');
  listenTelegramAdmin(bots);
}
