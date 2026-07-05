import express from 'express';
import {
  getSupportedProviders,
  getPaymentSettings,
  savePaymentSettings,
  initiatePayment,
  verifyPayment,
  processWebhook,
  refundPayment,
  getTransactionHistory,
  getTransaction,
  getPaymentInstructions,
  getPaymentStats
} from '../controllers/PaymentController.js';
import { protect, allowAdmin } from '../middlewares/authMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';
import { injectOwnership } from '../middlewares/tenantMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { requireFeature } from '../middlewares/featureAccess.js';

const router = express.Router();

// Public webhook endpoint (no auth)
router.post('/webhook/:provider/:schoolId', processWebhook);

// Get supported providers (public)
router.get('/providers', getSupportedProviders);

// All routes below require authentication
router.use(protect);
router.use(injectOwnership);
router.use(branchIsolation);
router.use(checkSubscription);
router.use(requireFeature('payment-integration'));

// Payment settings routes
router.get('/settings', getPaymentSettings);
router.post('/settings', savePaymentSettings);

// Payment routes
router.post('/initiate', initiatePayment);
router.get('/verify/:transactionId', verifyPayment);
router.post('/refund/:transactionId', refundPayment);

// Transaction routes
router.get('/transactions', getTransactionHistory);
router.get('/transactions/:transactionId', getTransaction);

// Payment instructions
router.post('/instructions/:provider', getPaymentInstructions);

// Dashboard stats
router.get('/stats', getPaymentStats);

export default router;
