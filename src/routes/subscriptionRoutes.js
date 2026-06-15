import express from 'express';
import {
  getSubscription,
  getUsage,
  getSubscriptionSummary,
  requestUpgrade,
} from '../controllers/subscriptionController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

// School Admin Subscription Routes
// Allow any school admin role to access their subscription info
router.get('/', authorize('schooladmin', 'school_admin', 'admin'), getSubscription);
router.get('/usage', authorize('schooladmin', 'school_admin', 'admin'), getUsage);
router.get('/summary', authorize('schooladmin', 'school_admin', 'admin'), getSubscriptionSummary);
router.post('/upgrade-request', authorize('schooladmin', 'school_admin', 'admin'), requestUpgrade);

export default router;
