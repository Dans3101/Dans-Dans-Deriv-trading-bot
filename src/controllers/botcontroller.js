import { usersDB, bots } from '../db/memoryStore.js';
import { UserSession } from '../users/userSession.js';
import { DerivBot } from '../bot/DerivBot.js';
import { canTrade } from '../middleware/paymentGuard.js';

export function startBot(req, res) {
  const { email, apiToken, market } = req.body;
  const user = usersDB[email];

  if (!user || !user.activationPaid) {
    return res.status(403).json({ error: 'Bot not activated' });
  }

  if (!canTrade(user)) {
    return res.status(403).json({ error: 'Performance fee unpaid' });
  }

  const session = new UserSession({
    userId: email,
    apiToken,
    market
  });

  const bot = new DerivBot(session);
  bot.connect();

  bots[email] = bot;

  res.json({ message: 'Bot started' });
}

export function stopBot(req, res) {
  const { email } = req.body;
  const bot = bots[email];

  if (bot) {
    bot.user.ws.close();
    delete bots[email];
  }

  res.json({ message: 'Bot stopped' });
}