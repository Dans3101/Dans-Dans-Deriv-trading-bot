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
const MARKUP_PERCENT = 0.1; // 0.1% as seen in your settings

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
    const session = {
      ...userData,
      totalProfit: Number(userData.totalProfit) || 0,
      isRunning: userData.isRunning ?? true
    };
    const bot = new DerivBot(session);
    
    bot.onConnectionError = (err) => {
        console.error(`⚠️ Connection Error [${userData.userId}]: ${err.message}`);
        bots.delete(userData.userId);
    };

    bot.onTradeExecuted = (stake) => {
      // Only track volume for REAL accounts per Deriv UI
      if (!userData.userId.includes('VRTC')) {
        totalVolumeTraded += Number(stake);
      }
    };

    bot.connect();
    bots.set(userData.userId, bot);
  } catch (error) {
    console.error(`❌ Bot Start Failed:`, error.message);
  }
}

/* ================= UI GENERATORS ================= */

function generateUserTrackingCard(shortId) {
    let activeBot = null;
    bots.forEach((bot, id) => { if (id.endsWith(shortId)) activeBot = bot; });
    
    if (!activeBot) return `<div style="padding:20px; color:red;">❌ Session not found. Re-link account.</div><a href="/" class="btn btn-dark">Home</a>`;

    const u = activeBot.user;
    const isDemo = u.userId.includes('VRTC');
    const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=EN&brand=deriv`;
    
    // REDIRECT TARGET: This sends them to the page in your 4th screenshot
    const derivLiveUrl = isDemo ? "https://dbot.deriv.com/bot" : "https://app.deriv.com/reports/positions";

    return `
        <div style="text-align:left;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <b style="color:#2c3e50;">ID: ${u.userId}</b>
                <span style="background:${isDemo ? '#fff3e0' : '#e8f5e9'}; color:${isDemo ? '#e67e22' : '#2e7d32'}; padding:3px 10px; border-radius:50px; font-size:11px; font-weight:bold;">
                    ${isDemo ? '🔵 DEMO' : '🟢 REAL'}
                </span>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                <div style="background:#f8f9fa; padding:12px; border-radius:10px; border:1px solid #eee; text-align:center;">
                    <small style="color:#888;">Balance</small><br><b style="font-size:18px;">$${Number(u.currentBalance || 0).toFixed(2)}</b>
                </div>
                <div style="background:#f8f9fa; padding:12px; border-radius:10px; border:1px solid #eee; text-align:center;">
                    <small style="color:#888;">Profit</small><br><b style="font-size:18px; color:${u.totalProfit >= 0 ? '#27ae60' : '#d91e18'};">$${Number(u.totalProfit || 0).toFixed(2)}</b>
                </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px;">
                <form action="/user/toggle" method="POST">
                    <input type="hidden" name="trackId" value="${shortId}">
                    <button type="submit" style="width:100%; padding:14px; border-radius:12px; border:none; background:${u.isRunning ? '#e67e22' : '#27ae60'}; color:white; font-weight:bold; cursor:pointer;">
                        ${u.isRunning ? '🛑 Stop AI Bot' : '🚀 Start & Go Live'}
                    </button>
                </form>
                
                <a href="${authUrl}" style="text-align:center; padding:12px; background:#3498db; color:white; border-radius:12px; text-decoration:none; font-weight:bold; font-size:14px;">🔄 Switch Account</a>
                
                <a href="${derivLiveUrl}" target="_blank" style="text-align:center; padding:12px; background:#2c3e50; color:white; border-radius:12px; text-decoration:none; font-weight:bold; font-size:14px;">📊 Watch Live Trades</a>
                
                <a href="/" style="text-align:center; padding:10px; color:#999; text-decoration:none; font-size:12px;">✖ Exit Tracking</a>
            </div>
        </div>`;
}

/* ================= ROUTES ================= */

app.get('/', (req, res) => {
  const trackId = req.query.trackId;
  const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=EN&brand=deriv`;
  res.send(`
    <!DOCTYPE html><html><head><title>Dans-Dans AI</title><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: sans-serif; background: #f4f7f6; margin: 0; display:flex; flex-direction:column; align-items:center; }
      .container { max-width: 420px; width: 92%; margin-top: 40px; }
      .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); text-align:center; margin-bottom:20px; }
      .btn { display:block; padding:16px; border-radius:12px; text-decoration:none; font-weight:bold; margin-bottom:10px; border:none; cursor:pointer; width:100%; box-sizing:border-box; }
      .btn-red { background: #d91e18; color: white; }
      .btn-dark { background: #2c3e50; color: white; }
    </style>
    </head><body>
      <div class="container">
        <h2 style="color:#2c3e50;">Dans-Dans AI Dashboard</h2>
        <p style="font-size:12px; color:#888;">App ID: ${APP_ID}</p>
        ${trackId ? `<div class="card">${generateUserTrackingCard(trackId)}</div>` : `
          <div class="card">
            <h3>Connect Account</h3>
            <a href="${authUrl}" class="btn btn-red">Connect via Deriv</a>
          </div>
          <div class="card">
            <h3>Track Activity</h3>
            <form action="/" method="GET">
                <input type="text" name="trackId" placeholder="Last 4 digits of Account" style="width:100%; padding:14px; margin-bottom:10px; border:1px solid #eee; border-radius:10px; box-sizing:border-box; text-align:center;">
                <button type="submit" class="btn btn-dark">Enter Dashboard</button>
            </form>
          </div>
        `}
        <a href="/admin-login" style="color:#ddd; text-decoration:none; font-size:10px;">🛡️ ADMIN</a>
      </div>
    </body></html>`);
});

app.get('/callback', async (req, res) => {
    const { acct1, token1 } = req.query;
    if (!token1) return res.send("Auth failed.");
    const userId = acct1.includes('VRTC') ? acct1 : `CR_${acct1}`;
    try {
        await pool.query(`INSERT INTO users (user_id, api_token, active, is_running) VALUES ($1, $2, true, true) ON CONFLICT (user_id) DO UPDATE SET api_token = $2, active = true`, [userId, token1]);
        await bootBot({ userId, apiToken: token1, isRunning: true });
        res.redirect(`/?trackId=${acct1.slice(-4)}`);
    } catch (e) { res.send("Error saving account."); }
});

/* ================= ADMIN PORTAL ================= */

app.get('/admin-login', (req, res) => {
    res.send(`<body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;"><div style="background:white; padding:30px; border-radius:20px; text-align:center;"><form action="/admin-portal" method="POST"><h3>Admin</h3><input type="password" name="password" style="padding:10px; margin-bottom:10px;"><br><button type="submit">Login</button></form></div></body>`);
});

app.post('/admin-portal', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.send("Denied");
  const commission = (totalVolumeTraded * (MARKUP_PERCENT / 100)).toFixed(2);
  let rows = "";
  bots.forEach((bot, id) => {
    rows += `<tr><td>${id}</td><td>$${Number(bot.user.totalProfit).toFixed(2)}</td><td>${bot.user.isRunning ? '🟢 Live' : '🟠 Off'}</td></tr>`;
  });
  res.send(`<body style="font-family:sans-serif; padding:20px;"><h2>Staff Dashboard</h2><p>Markup Earnings: $${commission}</p><table border="1" width="100%">${rows}</table><br><a href="/">Exit</a></body>`);
});

/* ================= TOGGLE LOGIC ================= */

app.post('/user/toggle', async (req, res) => {
    const { trackId } = req.body;
    let targetBot = null;
    let botUserId = "";

    bots.forEach((bot, id) => { if (id.endsWith(trackId)) { targetBot = bot; botUserId = id; } });

    if (targetBot) {
        targetBot.user.isRunning = !targetBot.user.isRunning;
        await pool.query("UPDATE users SET is_running = $1 WHERE user_id = $2", [targetBot.user.isRunning, targetBot.user.userId]);
        
        if (!targetBot.user.isRunning) {
            targetBot.stop();
            res.redirect(`/?trackId=${trackId}`);
        } else {
            targetBot.connect();
            // If they press START, redirect them to the LIVE TRADING PAGE immediately
            const redirectUrl = botUserId.includes('VRTC') ? "https://dbot.deriv.com/bot" : "https://app.deriv.com/reports/positions";
            res.send(`<html><script>window.open("${redirectUrl}", "_blank"); window.location.href="/?trackId=${trackId}";</script></html>`);
        }
    } else {
        res.redirect('/');
    }
});

app.listen(PORT, async () => {
  console.log(`🌐 Active on ${PORT}`);
  try {
    const result = await pool.query("SELECT * FROM users WHERE active = true");
    result.rows.forEach(u => bootBot({ userId: u.user_id, apiToken: u.api_token, isRunning: u.is_running }));
  } catch (e) { console.error("DB Error"); }
  listenTelegramAdmin(bots);
});
