import express from 'express';
import {
  getStudentClassAndSubjects,
  getStudentAttendance,
  getStudentResults,
  getFeesDue,
  payMonthlyFees,
  getPaymentHistory,
  getStudentDashboardStats,
  // New monthly payment endpoints
  getMyMonthlyPayments,
  payMonthlyFee,
  getStudentSchedule,
  // New payment system endpoints
  getStudentPaymentMethods,
  initiateStudentPayment,
  verifyStudentPayment,
  getStudentTransactionHistory,
  getStudentPaymentInstructions,
} from '../controllers/studentController.js';
import { getProfile } from '../controllers/authController.js';
import { getExamHalls, getExamHallById } from '../controllers/examHallController.js';
import { protect, allowStudent } from '../middlewares/authMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { injectOwnership, injectBranch } from '../middlewares/tenantMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(asyncHandler(protect));
router.use(allowStudent);
router.use(asyncHandler(injectBranch));
router.use(asyncHandler(injectAcademicYear));
router.use(injectOwnership);
router.use(asyncHandler(branchIsolation));

// Read-only routes (no subscription check needed)
router.get('/profile', asyncHandler(getProfile));
router.get('/dashboard-stats', asyncHandler(getStudentDashboardStats));
router.get('/class-subjects', asyncHandler(getStudentClassAndSubjects));
router.get('/schedule', asyncHandler(getStudentSchedule));
router.get('/attendance', asyncHandler(getStudentAttendance));
router.get('/results', asyncHandler(getStudentResults));
router.get('/exams', asyncHandler(getStudentResults)); // Alias for requested /api/student/exams

// Exam Hall Routes
router.use('/exam-halls', checkModuleAccess('exam-halls'));
router.get('/exam-halls', asyncHandler(getExamHalls));
router.get('/exam-halls/:id', asyncHandler(getExamHallById));

// ── Monthly Payment (new) ────────────────────────────────────────
router.get('/my-payments', asyncHandler(getMyMonthlyPayments));
router.get('/payments', asyncHandler(getMyMonthlyPayments)); // Alias for requested /api/student/payments
// Write operations - Block if subscription expired or school blocked
router.put('/my-payments/:id/pay', checkSubscription, asyncHandler(payMonthlyFee));

// ── New Payment System Endpoints ─────────────────────────────────
router.get('/payment-methods', asyncHandler(getStudentPaymentMethods));
router.post('/payments/initiate', checkSubscription, asyncHandler(initiateStudentPayment));
router.get('/payments/verify/:transactionId', asyncHandler(verifyStudentPayment));
router.get('/transactions', asyncHandler(getStudentTransactionHistory));
router.post('/payments/instructions/:providerId', checkSubscription, asyncHandler(getStudentPaymentInstructions));
// ────────────────────────────────────────────────────────────────

// Legacy routes (kept for backward compat)
router.get('/fees-due', asyncHandler(getFeesDue));
router.post('/pay-fees', checkSubscription, asyncHandler(payMonthlyFees));
router.get('/payment-history', asyncHandler(getPaymentHistory));

export default router;
