import express from 'express';
import {
  getParentChildren,
  getChildProfile,
  getChildAttendance,
  getChildResults,
  getChildFees,
  getChildTimetable,
  getParentAnnouncements,
  linkParentToStudents,
  getParentPaymentMethods,
  initiateParentPayment,
  verifyParentPayment,
  getParentTransactionHistory,
  getParentPaymentInstructions,
  payChildMonthlyFee
} from '../controllers/parentController.js';
import { protect, allowParent, allowAdmin } from '../middlewares/authMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';
import { injectOwnership } from '../middlewares/tenantMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';

const router = express.Router();

// Apply auth middleware to all routes except /link
const parentRouter = express.Router();
parentRouter.use(protect);
parentRouter.use(allowParent);
parentRouter.use(injectOwnership);
parentRouter.use(branchIsolation);

// Parent endpoints
parentRouter.get('/children', getParentChildren);
parentRouter.get('/children/:studentId/profile', getChildProfile);
parentRouter.get('/children/:studentId/attendance', getChildAttendance);
parentRouter.get('/children/:studentId/results', getChildResults);
parentRouter.get('/children/:studentId/fees', getChildFees);
parentRouter.get('/children/:studentId/timetable', getChildTimetable);
parentRouter.get('/announcements', getParentAnnouncements);
// Payment endpoints
parentRouter.get('/children/:studentId/payment-methods', getParentPaymentMethods);
parentRouter.post('/children/:studentId/payments/initiate', initiateParentPayment);
parentRouter.get('/children/:studentId/payments/verify/:transactionId', verifyParentPayment);
parentRouter.get('/children/:studentId/transactions', getParentTransactionHistory);
parentRouter.post('/children/:studentId/payments/instructions/:providerId', getParentPaymentInstructions);
parentRouter.put('/children/:studentId/my-payments/:id/pay', payChildMonthlyFee);

// Use the parent router for all routes except /link
router.use('/', parentRouter);

// Admin endpoint to link parents to students (separate middleware)
router.post('/link', protect, allowAdmin, linkParentToStudents);

export default router;
