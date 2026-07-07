import express from 'express';
import {
  getAssignedClasses,
  takeAttendance,
  getClassAttendance,
  submitMarks,
  getStudentsInClass,
  getClassSubjectMarks,
  getTaughtSubjects,
  getExams,
  markExamAsPresent,
  getTeacherSchedule,
  requestExam,
} from '../controllers/teacherController.js';
import { 
  getTeacherDashboardStats,
  getStudentProfile,
  getClassResults,
  bulkSubmitMarks,
} from '../controllers/adminController.js';
import { 
  getExamHalls, 
  getExamHallById,
  grantTemporaryClearance,
  revokeTemporaryClearance
} from '../controllers/examHallController.js';
import { protect, allowTeacher } from '../middlewares/authMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';
import { injectOwnership, injectBranch } from '../middlewares/tenantMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(asyncHandler(protect));
router.use(allowTeacher);
router.use(asyncHandler(injectBranch));
router.use(asyncHandler(injectAcademicYear));
router.use(injectOwnership);
router.use(asyncHandler(branchIsolation));

// Read-only routes (no subscription check needed)
router.get('/dashboard-stats', asyncHandler(getTeacherDashboardStats));
router.get('/assigned-classes', asyncHandler(getAssignedClasses));
router.get('/schedule', asyncHandler(getTeacherSchedule));
router.get('/classes', asyncHandler(getAssignedClasses)); // Alias for requested /api/teacher/classes
router.get('/taught-subjects', asyncHandler(getTaughtSubjects));
router.get('/class-students/:classId', asyncHandler(getStudentsInClass));
router.get('/exams', asyncHandler(getExams));
router.get('/class-attendance/:classId/:date', asyncHandler(getClassAttendance));
router.get('/class-attendance/:classId/:date/:subjectId', asyncHandler(getClassAttendance));
router.get('/class-subject-marks/:classId/:subjectId', asyncHandler(getClassSubjectMarks));

// Student Search & Results (read-only)
router.get('/student-profile/:customId', asyncHandler(getStudentProfile));
router.get('/class-results/:classId/:examName', asyncHandler(getClassResults));

// Write operations - Block if subscription expired or school blocked
router.post('/request-exam', checkSubscription, asyncHandler(requestExam));
router.put('/exams/:examId/present', checkSubscription, asyncHandler(markExamAsPresent));
router.post('/take-attendance', checkSubscription, asyncHandler(takeAttendance));
router.post('/attendance', checkSubscription, asyncHandler(takeAttendance)); // Alias for requested /api/teacher/attendance
router.post('/submit-marks', checkSubscription, asyncHandler(submitMarks));
router.post('/marks', checkSubscription, asyncHandler(submitMarks)); // Alias for requested /api/teacher/marks
router.post('/bulk-submit-marks', checkSubscription, asyncHandler(bulkSubmitMarks));

// Exam Hall Routes
router.use('/exam-halls', checkModuleAccess('exam-halls'));
router.get('/exam-halls', asyncHandler(getExamHalls));
router.get('/exam-halls/:id', asyncHandler(getExamHallById));
router.post('/exam-halls/temporary-clearance', checkSubscription, asyncHandler(grantTemporaryClearance));
router.post('/exam-halls/revoke-clearance', checkSubscription, asyncHandler(revokeTemporaryClearance));

export default router;
