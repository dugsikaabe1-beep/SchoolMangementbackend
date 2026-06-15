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
import { injectOwnership } from '../middlewares/tenantMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);
router.use(allowTeacher);
router.use(injectOwnership);
router.use(branchIsolation);

// Read-only routes (no subscription check needed)
router.get('/dashboard-stats', getTeacherDashboardStats);
router.get('/assigned-classes', getAssignedClasses);
router.get('/schedule', getTeacherSchedule);
router.get('/classes', getAssignedClasses); // Alias for requested /api/teacher/classes
router.get('/taught-subjects', getTaughtSubjects);
router.get('/class-students/:classId', getStudentsInClass);
router.get('/exams', getExams);
router.get('/class-attendance/:classId/:date', getClassAttendance);
router.get('/class-attendance/:classId/:date/:subjectId', getClassAttendance);
router.get('/class-subject-marks/:classId/:subjectId', getClassSubjectMarks);

// Student Search & Results (read-only)
router.get('/student-profile/:customId', getStudentProfile);
router.get('/class-results/:classId/:examName', getClassResults);

// Write operations - Block if subscription expired or school blocked
router.post('/request-exam', checkSubscription, requestExam);
router.put('/exams/:examId/present', checkSubscription, markExamAsPresent);
router.post('/take-attendance', checkSubscription, takeAttendance);
router.post('/attendance', checkSubscription, takeAttendance); // Alias for requested /api/teacher/attendance
router.post('/submit-marks', checkSubscription, submitMarks);
router.post('/marks', checkSubscription, submitMarks); // Alias for requested /api/teacher/marks
router.post('/bulk-submit-marks', checkSubscription, bulkSubmitMarks);

// Exam Hall Routes
router.use('/exam-halls', checkModuleAccess('exam-halls'));
router.get('/exam-halls', getExamHalls);
router.get('/exam-halls/:id', getExamHallById);
router.post('/exam-halls/temporary-clearance', checkSubscription, grantTemporaryClearance);
router.post('/exam-halls/revoke-clearance', checkSubscription, revokeTemporaryClearance);

export default router;
