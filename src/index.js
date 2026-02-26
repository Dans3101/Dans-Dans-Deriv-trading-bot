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
  const { token, acct } = req.query;
  const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=EN&brand=deriv`;

  res.send(`
    <!DOCTYPE html><html><head><title>Dans-Dans AI</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; display:flex; flex-direction:column; height:100vh; overflow:hidden; }
      nav { background: #102a43; color: white; padding: 12px 20px; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
      .main-content { flex: 1; padding: 20px; overflow-y: auto; }
      .bot-card { background: white; border-radius: 12px; padding: 25px; max-width: 320px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); text-align:center; border-top: 4px solid #d91e18; }
      .btn { padding: 12px 20px; border-radius: 8px; border:none; font-weight:bold; cursor:pointer; text-decoration:none; display:inline-block; transition: 0.3s; }
      .btn-run { background: #27ae60; color: white; width: 100%; margin-top: 15px; }
      .modal-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:1000; }
      .modal { background:white; padding:35px; border-radius:15px; text-align:center; max-width:380px; width:90%; position:relative; }
      .close-modal { position:absolute; right:15px; top:10px; font-size:24px; cursor:pointer; color:#999; }
      iframe { width: 100%; height: 100%; border: none; }
    </style>
    </head><body>
      <nav>
        <div style="display:flex; align-items:center; gap:10px;">
           <img src="https://cdn-icons-png.flaticon.com/512/2103/2103633.png" width="30">
           <b style="font-size:18px;">Dans-Dans AI</b>
        </div>
        ${token ? `<a href="/" style="color:white; text-decoration:none; font-size:14px;">Logout</a>` : ''}
      </nav>

      <div class="main-content">
        ${!token ? `
          <h3>Import a bot or start with a quick strategy:</h3>
          <div class="bot-card">
            <img src="https://cdn-icons-png.flaticon.com/512/2103/2103633.png" width="50" style="margin-bottom:10px;">
            <h3 style="margin:5px 0;">INSIDER M12</h3>
            <p style="color:#666; font-size:13px;">Digit Differs Strategy v3.1</p>
            <button onclick="document.getElementById('loginModal').style.display='flex'" class="btn btn-run">▶ Run</button>
          </div>

          <div id="loginModal" class="modal-overlay" style="display:none;">
            <div class="modal">
              <span class="close-modal" onclick="document.getElementById('loginModal').style.display='none'">&times;</span>
              <h2 style="margin-top:0;">You are not logged in</h2>
              <p style="color:#666; margin-bottom:25px;">Please log in or sign up to start trading with us.</p>
              <a href="${authUrl}" class="btn" style="background:#102a43; color:white; width:100%; margin-bottom:10px;">Log in</a>
              <a href="${authUrl}" class="btn" style="background:#2c3e50; color:white; width:100%;">Sign up</a>
            </div>
          </div>
        ` : `
          <div style="height: 100%; display: flex; flex-direction: column;">
            <div style="background:#fff; padding:10px; border-bottom:1px solid #ddd; display:flex; justify-content:space-between;">
                <span>Account: <b>${acct}</b></span>
                <span style="color:#27ae60;">● Bot Active</span>
            </div>
            <iframe src="https://dbot.deriv.com/bot?token=${token}"></iframe>
          </div>
        `}
      </div>

      <a href="/admin-login" style="position:fixed; bottom:5px; right:5px; color:#ddd; font-size:9px; text-decoration:none;">🛡️ STAFF</a>
    </body></html>`);
});

app.get('/callback', async (req, res) => {
    const { acct1, token1 } = req.query;
    if (!token1) return res.send("Auth failed.");
    const userId = acct1.includes('VRTC') ? acct1 : `CR_${acct1}`;
    
    try {
        await pool.query(`INSERT INTO users (user_id, api_token, active, is_running) VALUES ($1, $2, true, true) ON CONFLICT (user_id) DO UPDATE SET api_token = $2`, [userId, token1]);
        await bootBot({ userId, apiToken: token1 });
        // Redirect back to home but keep token in URL to show terminal
        res.redirect(`/?token=${token1}&acct=${acct1}`);
    } catch (e) { res.redirect('/'); }
});

/* ================= ADMIN PORTAL ================= */

app.get('/admin-login', (req, res) => {
    res.send(`<body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; background:#f4f7f6;"><div style="background:white; padding:30px; border-radius:20px; text-align:center; box-shadow:0 5px 15px rgba(0,0,0,0.1);"><form action="/admin-portal" method="POST"><h3>Admin Portal</h3><input type="password" name="password" placeholder="Password" style="padding:12px; margin-bottom:15px; border:1px solid #ddd; border-radius:8px; width:200px;"><br><button type="submit" class="btn" style="background:#102a43; color:white;">Login</button></form></div></body>`);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Access Denied");
  const commission = (totalVolumeTraded * MARKUP_PERCENT).toFixed(2);
  let rows = "";
  bots.forEach((bot, id) => {
    rows += `<tr><td>${id}</td><td>${bot.user.isRunning ? '🟢 Running' : '🟠 Off'}</td></tr>`;
  });
  res.send(`
    <body style="font-family:sans-serif; padding:30px; background:#f4f7f6;">
      <div style="max-width:800px; margin:auto; background:white; padding:30px; border-radius:20px;">
        <h2>🛡️ System Monitor</h2>
        <p>Commission Earned (0.1%): <b>$${commission}</b></p>
        <table border="1" width="100%" cellpadding="10" style="border-collapse:collapse;">
            <thead><tr style="background:#eee;"><th>User ID</th><th>Status</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="2">No active bots</td></tr>'}</tbody>
        </table>
        <br><a href="/" class="btn" style="background:#2c3e50; color:white;">Back to Home</a>
      </div>
    </body>`);
});

app.listen(PORT, async () => {
  console.log(`🌐 Server Active on ${PORT}`);
  try {
    const result = await pool.query("SELECT * FROM users WHERE active = true");
    result.rows.forEach(u => bootBot({ userId: u.user_id, apiToken: u.api_token }));
  } catch (e) { console.error("Database Startup Error"); }
  listenTelegramAdmin(bots);
});
