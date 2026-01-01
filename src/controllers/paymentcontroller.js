import { usersDB } from '../db/memoryStore.js';

export function activateBot(req, res) {
  const { email } = req.body;

  if (!usersDB[email]) {
    return res.status(404).json({ error: 'User not found' });
  }

  usersDB[email].activationPaid = true;
  usersDB[email].activated = true;

  res.json({ message: 'Bot activated' });
}

export function payPerformanceFee(req, res) {
  const { email } = req.body;

  usersDB[email].performanceFeePaid = true;

  res.json({ message: 'Performance fee cleared' });
}