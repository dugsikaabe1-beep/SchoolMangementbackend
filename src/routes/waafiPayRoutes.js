import express from 'express';
import {
  getWaafiSettings,
  saveWaafiSettings,
  testConnection,
  purchase,
  reversal,
  processWebhook
} from '../controllers/WaafiPayController.js';
import { protect, allowAdmin } from '../middlewares/authMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';
import { injectOwnership } from '../middlewares/tenantMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { requireFeature } from '../middlewares/featureAccess.js';

const router = express.Router();

// Webhook must be first and must use express.raw to preserve body for HMAC
// The raw middleware is applied in app.js, so here we just route it.
router.post('/webhook/:schoolId', processWebhook);

// Protected routes
router.use(protect);
router.use(injectOwnership);
router.use(branchIsolation);
router.use(checkSubscription);
router.use(requireFeature('payment-integration'));

// Settings (Admin only)
router.get('/settings', allowAdmin, getWaafiSettings);
router.post('/settings', allowAdmin, saveWaafiSettings);
router.post('/test-connection', allowAdmin, testConnection);

// Reversal (Admin only)
router.post('/reversal/:transactionId', allowAdmin, reversal);

// Purchase (Student, Parent, Admin)
router.post('/purchase', purchase);

export default router;
