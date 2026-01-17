import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'src', 'logs', 'trades.log');

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

  fs.appendFile(LOG_FILE, logEntry, (err) => {
    if (err) console.error('❌ Trade logging failed:', err);
  });
}