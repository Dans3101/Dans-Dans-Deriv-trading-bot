import express from 'express';
import {
  getAllUsers,
  stopUserBot,
  clearPerformanceFee
} from '../admin/adminController.js';

const router = express.Router();

router.use((req, res, next) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
});

router.get('/users', getAllUsers);
router.post('/stop-bot', stopUserBot);
router.post('/clear-fee', clearPerformanceFee);

export default router;