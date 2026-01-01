import express from 'express';
import {
  activateBot,
  payPerformanceFee
} from '../controllers/paymentController.js';

const router = express.Router();

router.post('/activate', activateBot);
router.post('/performance-fee', payPerformanceFee);

export default router;