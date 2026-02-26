import 'dotenv/config';
import express from 'express';
import { Pool } from 'pg';
import { DerivBot } from './bot/DerivBot.js';
import { listenTelegramAdmin } from './notifications/telegramAdmin.js';

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CONFIGURATION ================= */
const APP_ID = process.env.DERIV_APP_ID || "129457";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const BASE_URL = "https://dans-dans-deriv-trading-bot.onrender.com";
const REDIRECT_URI = `${BASE_URL}/callback`;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

export const bots = new Map();

/* ================= BOT BOOT LOGIC ================= */
async function bootBot(userData) {
  if (bots.has(userData.userId)) return;

  try {
    const session = { ...userData, totalProfit: 0, isRunning: true };
    const bot = new DerivBot(session);

    bot.connect();
    bots.set(userData.userId, bot);

    console.log(`✅ Bot started for ${userData.userId}`);
  } catch (e) {
    console.error("Bot boot failed:", e.message);
  }
}

/* ================= WEB UI ================= */

app.get('/', (req, res) => {
  const { token, acct } = req.query;

  const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Dans-Dans Trading Bot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; display:flex; flex-direction:column; height:100vh; }
      nav { background: #102a43; color: white; padding: 12px 20px; display:flex; justify-content:space-between; align-items:center; }
      .main { flex:1; display:flex; justify-content:center; align-items:center; padding:20px; }
      .card { background:white; padding:30px; border-radius:12px; width:100%; max-width:350px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.08); }
      .btn { padding:12px 20px; border-radius:8px; border:none; font-weight:bold; cursor:pointer; text-decoration:none; display:inline-block; }
      .btn-primary { background:#102a43; color:white; width:100%; margin-top:15px; }
      iframe { width:100%; height:100%; border:none; }
    </style>
  </head>
  <body>

    <nav>
      <div><strong>Dans-Dans Trading Bot</strong></div>
      ${token ? `<a href="/" style="color:white; text-decoration:none;">Logout</a>` : ''}
    </nav>

    <div class="main">
      ${!token ? `
        <div class="card">
          <h2>AI Digit Strategy v3.1</h2>
          <p style="color:#666;">Connect your Deriv account to start automated trading.</p>
          <a href="${authUrl}" class="btn btn-primary">Connect to Deriv</a>
        </div>
      ` : `
        <div style="width:100%; height:100%; display:flex; flex-direction:column;">
          <div style="background:#fff; padding:10px; text-align:center; border-bottom:1px solid #ddd;">
            Account: <b style="color:#d91e18;">${acct}</b> | Status: <b style="color:#27ae60;">Connected</b>
          </div>
          <iframe src="https://dbot.deriv.com/?token=${token}"></iframe>
        </div>
      `}
    </div>

  </body>
  </html>
  `);
});

/* ================= CALLBACK ROUTE ================= */

app.get('/callback', async (req, res) => {
  const { acct1, token1 } = req.query;

  if (!token1) {
    return res.send("<h2>Connection Failed</h2><p>No token received.</p><a href='/'>Go Back</a>");
  }

  const userId = acct1.includes('VRTC') ? acct1 : `CR_${acct1}`;

  try {
    await pool.query(
      `INSERT INTO users (user_id, api_token, active, is_running)
       VALUES ($1, $2, true, true)
       ON CONFLICT (user_id)
       DO UPDATE SET api_token = $2`,
      [userId, token1]
    );

    await bootBot({ userId, apiToken: token1 });

    console.log(`🔐 User connected: ${acct1}`);

    res.redirect(`/?token=${token1}&acct=${acct1}`);
  } catch (e) {
    console.error("Callback Error:", e.message);
    res.redirect('/');
  }
});

/* ================= ADMIN ================= */

app.get('/admin-login', (req, res) => {
  res.send(`
    <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
      <form action="/admin-portal" method="POST">
        <h3>Staff Access</h3>
        <input type="password" name="password" placeholder="Password"/>
        <button type="submit">Enter</button>
      </form>
    </body>
  `);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");
  res.send("<h1>Admin Portal</h1><p>Bot System Active.</p><a href='/'>Home</a>");
});

/* ================= SERVER START ================= */

app.listen(PORT, async () => {
  console.log(`🌐 Server running on port ${PORT}`);

  try {
    const result = await pool.query("SELECT * FROM users WHERE active = true");
    result.rows.forEach(u =>
      bootBot({ userId: u.user_id, apiToken: u.api_token })
    );
  } catch (e) {
    console.error("Database Startup Error:", e.message);
  }

  listenTelegramAdmin(bots);
});