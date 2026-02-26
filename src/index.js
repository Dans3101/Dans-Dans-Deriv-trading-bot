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
    bot.onTradeExecuted = (stake) => { if (!userData.userId.includes('VRTC')) totalVolumeTraded += Number(stake); };
    bot.connect();
    bots.set(userData.userId, bot);
  } catch (e) { console.error("Bot boot failed"); }
}

/* ================= WEB UI ================= */

app.get('/', (req, res) => {
  // Use 'token' from query string to determine if user is logged in
  const { token, acct } = req.query;
  const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=EN&brand=deriv`;

  res.send(`
    <!DOCTYPE html><html><head><title>Dans-Dans Trading Bot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; display:flex; flex-direction:column; height:100vh; overflow:hidden; }
      nav { background: #102a43; color: white; padding: 12px 20px; display:flex; justify-content:space-between; align-items:center; }
      .main-content { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; align-items: center; }
      .bot-card { background: white; border-radius: 12px; padding: 25px; width: 100%; max-width: 320px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); text-align:center; border-top: 4px solid #d91e18; margin-top: 20px; }
      .btn { padding: 12px 20px; border-radius: 8px; border:none; font-weight:bold; cursor:pointer; text-decoration:none; display:inline-block; }
      .btn-run { background: #27ae60; color: white; width: 100%; margin-top: 15px; }
      .modal-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:1000; }
      .modal { background:white; padding:35px; border-radius:15px; text-align:center; max-width:380px; width:90%; position:relative; }
      iframe { width: 100%; height: 100%; border: none; flex: 1; }
    </style>
    </head><body>
      <nav>
        <div style="font-weight:bold; font-size:18px;">Dans-Dans Trading Bot</div>
        ${token ? `<a href="/" style="color:white; text-decoration:none; font-size:14px;">Logout</a>` : ''}
      </nav>

      <div class="main-content">
        ${!token ? `
          <h3 style="color:#102a43;">Available Strategies</h3>
          <div class="bot-card">
            <img src="https://cdn-icons-png.flaticon.com/512/2103/2103633.png" width="50" style="margin-bottom:10px;">
            <h3 style="margin:5px 0;">Dans-Dans Trading Bot</h3>
            <p style="color:#666; font-size:13px;">AI Digit Strategy v3.1</p>
            <button onclick="document.getElementById('loginModal').style.display='flex'" class="btn btn-run">▶ Run</button>
          </div>

          <div id="loginModal" class="modal-overlay" style="display:none;">
            <div class="modal">
              <h2>You are not logged in</h2>
              <p style="color:#666; margin-bottom:25px;">Log in with your Deriv account to start the Dans-Dans bot.</p>
              <a href="${authUrl}" class="btn" style="background:#102a43; color:white; width:100%;">Log in</a>
              <button onclick="document.getElementById('loginModal').style.display='none'" style="margin-top:15px; background:none; border:none; color:#999; cursor:pointer;">Cancel</button>
            </div>
          </div>
        ` : `
          <div style="width:100%; height:100%; display:flex; flex-direction:column;">
            <div style="background:#fff; padding:10px; border-bottom:1px solid #ddd; text-align:center;">
                Account: <b style="color:#d91e18;">${acct}</b> | Status: <b style="color:#27ae60;">Active</b>
            </div>
            <iframe src="https://dbot.deriv.com/bot?token=${token}"></iframe>
          </div>
        `}
      </div>
    </body></html>`);
});

app.get('/callback', async (req, res) => {
    // acct1 and token1 are the standard parameters returned by Deriv
    const { acct1, token1 } = req.query;
    
    if (!token1) {
        return res.send("<h2>Connection Failed</h2><p>Could not retrieve token from Deriv. Please try again.</p><a href='/'>Go Back</a>");
    }

    const userId = acct1.includes('VRTC') ? acct1 : `CR_${acct1}`;
    
    try {
        await pool.query(`INSERT INTO users (user_id, api_token, active, is_running) VALUES ($1, $2, true, true) ON CONFLICT (user_id) DO UPDATE SET api_token = $2`, [userId, token1]);
        await bootBot({ userId, apiToken: token1 });
        
        // Pass token and acct back to home page via URL
        res.redirect(`/?token=${token1}&acct=${acct1}`);
    } catch (e) { 
        console.error("Callback DB Error:", e.message);
        res.redirect('/'); 
    }
});

/* ================= ADMIN ================= */

app.get('/admin-login', (req, res) => {
    res.send(`<body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;"><form action="/admin-portal" method="POST"><h3>Staff Access</h3><input type="password" name="password"><button type="submit">Enter</button></form></body>`);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");
  res.send(`<h1>Admin Portal</h1><p>Volume Tracking Active.</p><a href="/">Home</a>`);
});

app.listen(PORT, async () => {
  console.log(`🌐 Server Active on ${PORT}`);
  try {
    const result = await pool.query("SELECT * FROM users WHERE active = true");
    result.rows.forEach(u => bootBot({ userId: u.user_id, apiToken: u.api_token }));
  } catch (e) { console.error("Database Startup Error"); }
  listenTelegramAdmin(bots);
});
