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
} from '../controllers/studentController.js';
import { getProfile } from '../controllers/authController.js';
import { getExamHalls, getExamHallById } from '../controllers/examHallController.js';
import { protect, allowStudent } from '../middlewares/authMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);
router.use(allowStudent);

// Read-only routes (no subscription check needed)
router.get('/profile', getProfile);
router.get('/dashboard-stats', getStudentDashboardStats);
router.get('/class-subjects', getStudentClassAndSubjects);
router.get('/schedule', getStudentSchedule);
router.get('/attendance', getStudentAttendance);
router.get('/results', getStudentResults);
router.get('/exams', getStudentResults); // Alias for requested /api/student/exams

// Exam Hall Routes
router.get('/exam-halls', getExamHalls);
router.get('/exam-halls/:id', getExamHallById);

// ── Monthly Payment (new) ────────────────────────────────────────
router.get('/my-payments', getMyMonthlyPayments);
router.get('/payments', getMyMonthlyPayments); // Alias for requested /api/student/payments
// Write operations - Block if subscription expired or school blocked
router.put('/my-payments/:id/pay', checkSubscription, payMonthlyFee);
// ────────────────────────────────────────────────────────────────

// Legacy routes (kept for backward compat)
router.get('/fees-due', getFeesDue);
router.post('/pay-fees', checkSubscription, payMonthlyFees);
router.get('/payment-history', getPaymentHistory);

export default router;
