import { usersDB, bots } from '../db/memoryStore.js';

export function getAllUsers(req, res) {
  res.json(usersDB);
}

export function stopUserBot(req, res) {
  const { email } = req.body;

  if (bots[email]) {
    bots[email].user.ws.close();
    delete bots[email];
  }

  res.json({ message: `Bot stopped for ${email}` });
}

export function clearPerformanceFee(req, res) {
  const { email } = req.body;

  if (usersDB[email]) {
    usersDB[email].performanceFeePaid = true;
  }

  res.json({ message: 'Performance fee cleared' });
}