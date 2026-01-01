import 'dotenv/config';
import { UserSession } from './users/userSession.js';
import { DerivBot } from './bot/DerivBot.js';

const users = [
  {
    userId: 'user_001',
    apiToken: 'PUT_DERIV_TOKEN_HERE',
    market: 'R_75'
  }
];

users.forEach(userData => {
  const session = new UserSession(userData);
  const bot = new DerivBot(session);
  bot.connect();
});
