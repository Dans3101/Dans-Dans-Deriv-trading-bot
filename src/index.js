import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import { Pool } from 'pg';

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

/* ================= BOT FOLDER ================= */
const BOT_FOLDER = './bots';

function getAvailableBots() {
  if (!fs.existsSync(BOT_FOLDER)) return [];
  return fs.readdirSync(BOT_FOLDER).filter(file => file.endsWith('.xml'));
}

/* ================= BOT BOOT LOGIC ================= */
async function bootBot(userData, botFile) {
  if (bots.has(userData.userId)) return;

  try {
    const session = { ...userData, totalProfit: 0, isRunning: false, xml: null };

    if (botFile) {
      const xmlPath = `${BOT_FOLDER}/${botFile}`;
      if (fs.existsSync(xmlPath)) {
        session.xml = fs.readFileSync(xmlPath, 'utf8');
        console.log(`✅ Loaded XML: ${botFile}`);
      } else {
        console.warn("Bot XML file not found at:", xmlPath);
      }
    }

    bots.set(userData.userId, session);
    console.log(`✅ Bot instance ready for ${userData.userId}`);
  } catch (e) {
    console.error("Bot boot failed:", e.message);
  }
}

function startBot(userId) {
  const bot = bots.get(userId);
  if (!bot) return false;

  if (!bot.isRunning && bot.xml) {
    bot.isRunning = true;
    // Here you would connect and run the trading logic using bot.xml
    console.log(`🚀 Bot started for ${userId}`);
    return true;
  }

  return false;
}

function stopBot(userId) {
  const bot = bots.get(userId);
  if (!bot) return false;

  if (bot.isRunning) {
    bot.isRunning = false;
    // Stop the trading logic here
    console.log(`🛑 Bot stopped for ${userId}`);
    return true;
  }

  return false;
}

/* ================= FRONTEND ================= */
app.get('/', (req, res) => {
  const { token, acct } = req.query;
  const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  const botList = getAvailableBots();

  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Dans-Dans Trading Bot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: 'Segoe UI', sans-serif; background:#f0f2f5; margin:0; display:flex; flex-direction:column; height:100vh; }
      nav { background:#102a43; color:white; padding:12px 20px; display:flex; justify-content:space-between; align-items:center; }
      .main { flex:1; display:flex; justify-content:center; align-items:center; padding:20px; }
      .card { background:white; padding:30px; border-radius:12px; width:100%; max-width:400px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.08); }
      .btn { padding:12px 20px; border-radius:8px; border:none; font-weight:bold; cursor:pointer; text-decoration:none; display:inline-block; }
      .btn-primary { background:#102a43; color:white; width:100%; margin-top:15px; }
      .btn-run { background:#27ae60; color:white; width:48%; margin-top:10px; margin-right:2%; }
      .btn-stop { background:#d91e18; color:white; width:48%; margin-top:10px; }
      select { padding:10px; width:100%; margin-top:10px; }
      .status { margin-top:15px; font-size:14px; color:#555; }
    </style>
    <script>
      async function loadBot() {
        const botFile = document.getElementById('botSelect').value;
        const res = await fetch('/load-bot', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ token:'${token}', botFile })
        });
        const data = await res.json();
        document.getElementById('bot-status').innerText = data.success ? 'Bot Loaded ✅' : 'Failed to load';
      }

      async function runBot() {
        const res = await fetch('/start-bot', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body:JSON.stringify({ token:'${token}' })
        });
        const data = await res.json();
        document.getElementById('bot-status').innerText = data.success ? 'Bot Running 🚀' : 'Failed to start';
      }

      async function stopBotFunc() {
        const res = await fetch('/stop-bot', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body:JSON.stringify({ token:'${token}' })
        });
        const data = await res.json();
        document.getElementById('bot-status').innerText = data.success ? 'Bot Stopped 🛑' : 'Failed to stop';
      }
    </script>
  </head>
  <body>
    <nav>
      <div><strong>Dans-Dans Trading Bot</strong></div>
      ${token ? `<a href="/" style="color:white;text-decoration:none;">Logout</a>` : ''}
    </nav>

    <div class="main">
      ${!token ? `
        <div class="card">
          <h2>AI Digit Strategy v3.1</h2>
          <p style="color:#666;">Connect your Deriv account to start automated trading.</p>
          <a href="${authUrl}" class="btn btn-primary">Connect to Deriv</a>
        </div>
      ` : `
        <div class="card">
          <h2>Connected: ${acct}</h2>
          <div class="status" id="bot-status">Bot Ready 🟡</div>
          <select id="botSelect">
            ${botList.map(b => `<option value="${b}">${b}</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="loadBot()">Load Bot</button>
          <button class="btn btn-run" onclick="runBot()">Run Bot</button>
          <button class="btn btn-stop" onclick="stopBotFunc()">Stop Bot</button>
        </div>
      `}
    </div>
  </body>
  </html>
  `);
});

/* ================= CALLBACK ================= */
app.get('/callback', async (req, res) => {
  const { acct1, token1 } = req.query;
  if (!token1) return res.send("<h2>Connection Failed</h2><p>No token received.</p><a href='/'>Go Back</a>");

  const userId = acct1.includes('VRTC') ? acct1 : `CR_${acct1}`;

  try {
    await pool.query(
      `INSERT INTO users (user_id, api_token, active, is_running)
       VALUES ($1,$2,true,false)
       ON CONFLICT(user_id) DO UPDATE SET api_token=$2`,
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

/* ================= BOT CONTROL ROUTES ================= */
app.post('/load-bot', async (req, res) => {
  const { token, botFile } = req.body;

  try {
    const user = await pool.query("SELECT user_id FROM users WHERE api_token=$1", [token]);
    if (!user.rows[0]) return res.json({ success:false });

    await bootBot({ userId: user.rows[0].user_id, apiToken: token }, botFile);
    res.json({ success:true });
  } catch (e) { res.json({ success:false }); }
});

app.post('/start-bot', async (req, res) => {
  const { token } = req.body;

  try {
    const user = await pool.query("SELECT user_id FROM users WHERE api_token=$1", [token]);
    if (!user.rows[0]) return res.json({ success:false });

    const success = startBot(user.rows[0].user_id);
    res.json({ success });
  } catch (e) { res.json({ success:false }); }
});

app.post('/stop-bot', async (req, res) => {
  const { token } = req.body;

  try {
    const user = await pool.query("SELECT user_id FROM users WHERE api_token=$1", [token]);
    if (!user.rows[0]) return res.json({ success:false });

    const success = stopBot(user.rows[0].user_id);
    res.json({ success });
  } catch (e) { res.json({ success:false }); }
});

/* ================= ADMIN ================= */
app.get('/admin-login', (req, res) => {
  res.send(`
    <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
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
    result.rows.forEach(u => bootBot({ userId: u.user_id, apiToken: u.api_token }));
  } catch (e) { console.error("Database Startup Error:", e.message); }
});