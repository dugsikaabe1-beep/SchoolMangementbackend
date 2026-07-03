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
import { injectOwnership } from '../middlewares/tenantMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);
router.use(allowStudent);
router.use(injectOwnership);
router.use(branchIsolation);

// Read-only routes (no subscription check needed)
router.get('/profile', getProfile);
router.get('/dashboard-stats', getStudentDashboardStats);
router.get('/class-subjects', getStudentClassAndSubjects);
router.get('/schedule', getStudentSchedule);
router.get('/attendance', getStudentAttendance);
router.get('/results', getStudentResults);
router.get('/exams', getStudentResults); // Alias for requested /api/student/exams

// Exam Hall Routes
router.use('/exam-halls', checkModuleAccess('exam-halls'));
router.get('/exam-halls', getExamHalls);
router.get('/exam-halls/:id', getExamHallById);

// ── Monthly Payment (new) ────────────────────────────────────────
router.get('/my-payments', getMyMonthlyPayments);
router.get('/payments', getMyMonthlyPayments); // Alias for requested /api/student/payments
// Write operations - Block if subscription expired or school blocked
router.put('/my-payments/:id/pay', checkSubscription, payMonthlyFee);

// ── New Payment System Endpoints ─────────────────────────────────
router.get('/payment-methods', getStudentPaymentMethods);
router.post('/payments/initiate', checkSubscription, initiateStudentPayment);
router.get('/payments/verify/:transactionId', verifyStudentPayment);
router.get('/transactions', getStudentTransactionHistory);
router.post('/payments/instructions/:providerId', getStudentPaymentInstructions);
// ────────────────────────────────────────────────────────────────

// Legacy routes (kept for backward compat)
router.get('/fees-due', getFeesDue);
router.post('/pay-fees', checkSubscription, payMonthlyFees);
router.get('/payment-history', getPaymentHistory);

export default router;
