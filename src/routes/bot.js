import express from 'express';
import { startBot, stopBot } from '../controllers/botController.js';

const router = express.Router();

router.post('/start', startBot);
router.post('/stop', stopBot);

export default router;