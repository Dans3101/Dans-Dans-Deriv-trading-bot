import 'dotenv/config';
import express from 'express';
const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CONFIG ================= */
const APP_ID = process.env.DERIV_APP_ID || "YOUR_DERIV_APP_ID";
const BASE_URL = process.env.BASE_URL || "https://dans-dans-deriv-trading-bot.onrender.com";
const REDIRECT_URI = `${BASE_URL}/deriv-callback`;

/* ================= BOT CONFIG ================= */
// Only one bot for now
const bots = [
  {
    name: "Dans-Dans bot",
    xmlUrl: "https://raw.githubusercontent.com/Dans3101/Dans-Dans-Deriv-trading-bot/main/bots/digit_over.xml"
  }
];

/* ================= FRONTEND ================= */
app.get('/', (req, res) => {
  let botsHtml = bots.map(bot => `
    <div class="bot-card">
      <h3>${bot.name}</h3>
      <a href="https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&bot=${encodeURIComponent(bot.xmlUrl)}" class="launch-btn">
        Launch Bot on Deriv
      </a>
    </div>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dans-Dans Trading Bots</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background:#f0f2f5; margin:0; padding:0; display:flex; flex-direction:column; align-items:center; }
        header { background:#102a43; color:white; width:100%; padding:15px; text-align:center; }
        main { padding:20px; width:100%; max-width:600px; }
        .bot-card { background:white; margin:15px 0; padding:20px; border-radius:10px; box-shadow:0 4px 15px rgba(0,0,0,0.08); text-align:center; }
        .launch-btn { display:inline-block; padding:12px 20px; border-radius:8px; background:#27ae60; color:white; text-decoration:none; font-weight:bold; margin-top:10px; }
      </style>
    </head>
    <body>
      <header>
        <h1>Dans-Dans Trading Bots</h1>
        <p>Click a bot to launch on Deriv (demo or real account)</p>
      </header>
      <main>
        ${botsHtml}
      </main>
    </body>
    </html>
  `);
});

/* ================= DERIV CALLBACK ================= */
app.get('/deriv-callback', (req, res) => {
  const { bot } = req.query;
  if (!bot) return res.send("<h2>Error: No bot selected</h2>");

  res.send(`
    <h2>Bot Ready!</h2>
    <p>Your bot will now launch on Deriv: <strong>${bot}</strong></p>
    <p>If it doesn’t launch automatically, click below:</p>
    <a href="${bot}" target="_blank">Launch Bot</a>
  `);
});

/* ================= SERVER START ================= */
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`Visit: ${BASE_URL}`);
});