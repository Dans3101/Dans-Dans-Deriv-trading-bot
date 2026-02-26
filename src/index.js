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
const MARKUP_PERCENT = 0.001; 

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

export const bots = new Map();
let totalVolumeTraded = 0;

/* ================= BOT BOOT LOGIC ================= */
async function bootBot(userData) {
  if (bots.has(userData.userId)) return;
  try {
    const session = { ...userData, totalProfit: 0, isRunning: true };
    const bot = new DerivBot(session);
    
    bot.onTradeExecuted = (stake) => {
      if (!userData.userId.includes('VRTC')) {
        totalVolumeTraded += Number(stake);
      }
    };

    bot.connect();
    bots.set(userData.userId, bot);
  } catch (e) {
    console.error("Bot boot failed:", e.message);
  }
}

/* ================= WEB UI ================= */

app.get('/', (req, res) => {
  const { token, acct } = req.query;
  const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=EN&brand=deriv`;

  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Dans-Dans Trading Bot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; display:flex; flex-direction:column; height:100vh; overflow:hidden; }
      nav { background: #102a43; color: white; padding: 12px 20px; display:flex; justify-content:space-between; align-items:center; }
      .main { flex:1; display:flex; flex-direction:column; align-items:center; padding:20px; overflow-y:auto; }
      .bot-card { background:white; padding:30px; border-radius:12px; width:100%; max-width:320px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.08); border-top: 5px solid #d91e18; }
      .btn { padding:12px 20px; border-radius:8px; border:none; font-weight:bold; cursor:pointer; text-decoration:none; display:inline-block; transition: 0.3s; }
      .btn-run { background:#27ae60; color:white; width:100%; margin-top:15px; }
      
      /* MODAL STYLE FROM SCREENSHOT */
      .modal-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:1000; }
      .modal { background:white; padding:35px; border-radius:15px; text-align:center; max-width:380px; width:90%; }
      
      iframe { width:100%; height:100%; border:none; flex:1; }
    </style>
  </head>
  <body>

    <nav>
      <div style="font-weight:bold; font-size:18px;">Dans-Dans Trading Bot</div>
      ${token ? `<a href="/" style="color:white; text-decoration:none;">Logout</a>` : ''}
    </nav>

    <div class="main">
      ${!token ? `
        <h3 style="margin-bottom:20px; color:#102a43;">Available Trading Bots</h3>
        <div class="bot-card">
          <img src="https://cdn-icons-png.flaticon.com/512/2103/2103633.png" width="60" style="margin-bottom:15px;">
          <h2 style="margin:0;">Dans-Dans Bot v3.1</h2>
          <p style="color:#666; font-size:14px;">Digit Strategy | High Frequency</p>
          <button onclick="document.getElementById('loginModal').style.display='flex'" class="btn btn-run">▶ Run Bot</button>
        </div>

        <div id="loginModal" class="modal-overlay" style="display:none;">
          <div class="modal">
            <h2 style="margin-top:0;">You are not logged in</h2>
            <p style="color:#666; margin-bottom:25px;">Please log in with your Deriv account to start trading with Dans-Dans Bot.</p>
            <a href="${authUrl}" class="btn" style="background:#102a43; color:white; width:100%; margin-bottom:10px;">Log in</a>
            <button onclick="document.getElementById('loginModal').style.display='none'" style="background:none; border:none; color:#999; cursor:pointer; font-size:13px;">Cancel</button>
          </div>
        </div>
      ` : `
        <div style="width:100%; height:100%; display:flex; flex-direction:column;">
          <div style="background:#fff; padding:10px; text-align:center; border-bottom:1px solid #ddd;">
            Account: <b style="color:#d91e18;">${acct}</b> | <span style="color:#27ae60;">● Bot Active</span>
          </div>
          <iframe src="https://dbot.deriv.com/bot?token=${token}"></iframe>
        </div>
      `}
    </div>

    <a href="/admin-login" style="position:fixed; bottom:5px; right:5px; color:#ccc; font-size:9px; text-decoration:none;">🛡️ STAFF</a>
  </body>
  </html>
  `);
});

/* ================= CALLBACK ROUTE ================= */

app.get('/callback', async (req, res) => {
  const { acct1, token1 } = req.query;

  if (!token1) {
    return res.send("<h2>Connection Failed</h2><p>Login was canceled.</p><a href='/'>Go Back</a>");
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
    res.redirect(`/?token=${token1}&acct=${acct1}`);
  } catch (e) {
    res.redirect('/');
  }
});

/* ================= ADMIN PORTAL ================= */

app.get('/admin-login', (req, res) => {
  res.send(`<body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;"><form action="/admin-portal" method="POST"><h3>Admin Login</h3><input type="password" name="password" style="padding:10px;"><br><button type="submit" style="margin-top:10px;">Enter</button></form></body>`);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");
  const commission = (totalVolumeTraded * MARKUP_PERCENT).toFixed(2);
  res.send(`
    <body style="font-family:sans-serif; padding:30px;">
        <h2>🛡️ Admin Dashboard</h2>
        <div style="background:#f0f2f5; padding:20px; border-radius:10px;">
            Total Real Volume: <b>$${totalVolumeTraded.toFixed(2)}</b><br>
            Commission (0.1%): <b style="color:green;">$${commission}</b>
        </div>
        <br><a href="/">Back to Dashboard</a>
    </body>
  `);
});

/* ================= SERVER START ================= */

app.listen(PORT, async () => {
  console.log(`🌐 Server active on port ${PORT}`);
  try {
    const result = await pool.query("SELECT * FROM users WHERE active = true");
    result.rows.forEach(u => bootBot({ userId: u.user_id, apiToken: u.api_token }));
  } catch (e) {
    console.error("Startup Error:", e.message);
  }
  listenTelegramAdmin(bots);
});
