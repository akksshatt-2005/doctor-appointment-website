import express from 'express';
import { requireAuth, requireBookingScope } from '../middleware/authMiddleware.js';
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  handleWebhook
} from '../controllers/paymentController.js';

const router = express.Router();

// Order creation & client verification (require patient JWT with booking scope)
router.post('/payments/create-order', requireAuth, requireBookingScope, createRazorpayOrder);
router.post('/payments/verify', requireAuth, requireBookingScope, verifyPaymentSignature);

// Razorpay webhook receiver (public, signatures validated internally)
router.post('/payments/webhook', handleWebhook);

export default router;
