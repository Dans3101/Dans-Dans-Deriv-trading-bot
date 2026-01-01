import express from 'express';
import 'dotenv/config';

import authRoutes from './routes/auth.js';
import botRoutes from './routes/bot.js';
import paymentRoutes from './routes/payments.js';

const app = express();
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/bot', botRoutes);
app.use('/payments', paymentRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);