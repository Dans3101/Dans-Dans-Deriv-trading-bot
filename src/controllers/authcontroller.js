import { usersDB } from '../db/memoryStore.js';

export function register(req, res) {
  const { email, password } = req.body;

  if (usersDB[email]) {
    return res.status(400).json({ error: 'User exists' });
  }

  usersDB[email] = {
    email,
    password,
    activated: false,
    activationPaid: false,
    performanceFeePaid: true
  };

  res.json({ message: 'Registered successfully' });
}

export function login(req, res) {
  const { email, password } = req.body;

  const user = usersDB[email];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid login' });
  }

  res.json({ message: 'Login successful' });
}