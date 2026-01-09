import 'dotenv/config';
import { UserSession } from './users/userSession.js';
import { DerivBot } from './bot/DerivBot.js';

/**
 * Example users list
 * Later this will come from DB (Mongo/Postgres)
 */
const users = [
  {
    userId: 'user_001',
    apiToken: process.env.DERIV_API_TOKEN, // ✅ ENV VARIABLE
    market: 'R_75'
  }
];

if (!process.env.DERIV_API_TOKEN) {
  console.error('❌ DERIV_API_TOKEN is missing in environment variables');
  process.exit(1);
}

users.forEach(userData => {
  try {
    const session = new UserSession(userData);
    const bot = new DerivBot(session);
    bot.connect();
    console.log(`✅ Bot started for ${userData.userId}`);
  } catch (err) {
    console.error(`❌ Failed to start bot for ${userData.userId}`, err);
  }
});