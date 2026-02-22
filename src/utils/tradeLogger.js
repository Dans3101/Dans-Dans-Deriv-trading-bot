import fs from 'fs';
import path from 'path';

// process.cwd() is the project root on Render (/opt/render/project/src)
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'trades.log');

export function logTrade(data) {
  const timestamp = new Date().toISOString();

  const logEntry = JSON.stringify({
    time: timestamp,
    userId: data.userId,
    market: data.market,
    direction: data.direction,
    stake: data.stake,
    profit: data.profit,
    balance: data.balance
  }) + "\n";

  // 1. Ensure the directory exists first
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      console.log('📁 Created logs directory at:', LOG_DIR);
    }

    // 2. Append to the file
    fs.appendFile(LOG_FILE, logEntry, (err) => {
      if (err) {
        // We use warn instead of error to keep the console clean on read-only environments
        console.warn('⚠️ File append failed (likely ephemeral storage):', err.message);
      }
    });
  } catch (dirErr) {
    console.warn('⚠️ Directory creation failed:', dirErr.message);
  }
}
