import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import { UserSession } from './users/userSession.js';
import { DerivBot } from './bot/DerivBot.js';
import { listenTelegramAdmin } from './notifications/telegramAdmin.js';

/* ================= SERVER ================= */
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

export const bots = new Map();

/* ================= HOMEPAGE ================= */
app.get('/', (req, res) => {
  res.send(`
    <h2>🚀 Connect Your Deriv Account</h2>
    <form method="POST" action="/start">
      <label>Enter Deriv API Token:</label><br><br>
      <input type="text" name="apiToken" required style="width:300px;" />
      <br><br>
      <button type="submit">Start Bot</button>
    </form>
  `);
});

/* ================= START BOT ROUTE ================= */
app.post('/start', async (req, res) => {
  const { apiToken } = req.body;

  if (!apiToken) {
    return res.send("❌ API Token is required");
  }

  const userId = `user_${Date.now()}`;

  try {
    const session = new UserSession({
      userId,
      apiToken,
      market: 'R_10', // YOUR PURE DIGIT MARKET
      stake: 1,
      active: true
    });

    const bot = new DerivBot(session);

    await new Promise(resolve => {
      bot.connect();
      bot.user.ws.on('open', resolve);
    });

    bots.set(userId, bot);

    res.send(`
      ✅ Bot started successfully!<br><br>
      User ID: ${userId}<br><br>
      You can now close this page.
    `);

    console.log(`✅ New user connected: ${userId}`);

  } catch (err) {
    console.error(err);
    res.send("❌ Failed to start bot. Check your token.");
  }
});

/* ================= TELEGRAM ADMIN ================= */
if (!global.telegramStarted) {
  global.telegramStarted = true;
  listenTelegramAdmin(bots);
}

/* ================= START SERVER ================= */
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});