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
import { checkBranchAccess } from '../middlewares/branchContext.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { injectOwnership, injectBranch } from '../middlewares/tenantMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';

const router = express.Router();

// Apply auth middleware to all routes except /link
const parentRouter = express.Router();
parentRouter.use(asyncHandler(protect));
parentRouter.use(allowParent);
parentRouter.use(asyncHandler(injectBranch));
parentRouter.use(asyncHandler(injectAcademicYear));
parentRouter.use(injectOwnership);
parentRouter.use(asyncHandler(checkBranchAccess));

// Parent endpoints
parentRouter.get('/children', asyncHandler(getParentChildren));
parentRouter.get('/children/:studentId/profile', asyncHandler(getChildProfile));
parentRouter.get('/children/:studentId/attendance', asyncHandler(getChildAttendance));
parentRouter.get('/children/:studentId/results', asyncHandler(getChildResults));
parentRouter.get('/children/:studentId/fees', asyncHandler(getChildFees));
parentRouter.get('/children/:studentId/timetable', asyncHandler(getChildTimetable));
parentRouter.get('/announcements', asyncHandler(getParentAnnouncements));
// Payment endpoints
parentRouter.get('/children/:studentId/payment-methods', asyncHandler(getParentPaymentMethods));
parentRouter.post('/children/:studentId/payments/initiate', asyncHandler(initiateParentPayment));
parentRouter.get('/children/:studentId/payments/verify/:transactionId', asyncHandler(verifyParentPayment));
parentRouter.get('/children/:studentId/transactions', asyncHandler(getParentTransactionHistory));
parentRouter.post('/children/:studentId/payments/instructions/:providerId', asyncHandler(getParentPaymentInstructions));
parentRouter.put('/children/:studentId/my-payments/:id/pay', asyncHandler(payChildMonthlyFee));

// Use the parent router for all routes except /link
router.use('/', parentRouter);

// Admin endpoint to link parents to students (separate middleware)
router.post('/link', asyncHandler(protect), allowAdmin, asyncHandler(linkParentToStudents));

export default router;
