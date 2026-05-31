import express from 'express';
import {
  importStudents,
  importExamResults,
  downloadStudentTemplate,
  downloadExamTemplate,
  generateBulkCredentials,
  generateStudentLogin,
  downloadCredentials,
  downloadStudentErrorReport,
  downloadExamErrorReport,
  importTeachers,
  downloadTeacherTemplate,
  downloadTeacherErrorReport,
} from '../controllers/importController.js';
import { uploadExcel } from '../middlewares/uploadMiddleware.js';
import {
  createStudent,
  getStudents,
  updateStudent,
  deleteStudent,
  transferStudent,
  createTeacher,
  getTeachers,
  updateTeacher,
  deleteTeacher,
  checkTeacherId,
  createClass,
  getClasses,
  updateClass,
  deleteClass,
  createSubject,
  getSubjects,
  updateSubject,
  deleteSubject,
  checkSubjectCode,
  assignSubjectToClass,
  updateClassSubjectAssignment,
  removeClassSubjectAssignment,
  getDashboardStats,
  getTeacherDashboardStats,
  getExamRequests,
  approveExamRequest,
  getAllAttendance,
  updateAttendance,
  deleteAttendance,
  getStudentProfile,
  getStudentProfileForPrint,
  getTeacherProfile,
  getAllPayments,
  getAllExams,
  createExam,
  getAllMarks,
  getClassById,
  // Exam Session Management
  createExamSession,
  getExamSessions,
  getExamSessionById,
  getClassExamMarks,
  submitClassExamMarks,
  deleteClassExamMarks,
  // Monthly payment management
  createPaymentMonth,
  getPaymentMonths,
  getMonthlyPayments,
  markPaymentPaid,
  markPaymentUnpaid,
  getPaymentMatrix,
  deletePaymentMonth,
  generateMonthlyPaymentsManual,
  getPaymentStats,
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  publishExam,
  bulkSubmitMarks,
  getClassResults,
  getStudentAcademicSummary,
  // School settings
  getSchoolSettings,
  updateSchoolSettings,
  getExamMarks,
  updateExamMarks,
  // Password reset
  resetTeacherPassword,
  resetStudentPassword,
} from '../controllers/adminController.js';
import { getStudentsInClass, takeAttendance } from '../controllers/teacherController.js';
import { protect, allowAdmin, authorize } from '../middlewares/authMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

// Student routes - Block if subscription expired or school blocked
router.route('/students')
  .post(allowAdmin, checkSubscription, createStudent)
  .get(allowAdmin, getStudents);
router.route('/students/:id')
  .put(allowAdmin, checkSubscription, updateStudent)
  .delete(allowAdmin, checkSubscription, deleteStudent);
router.post('/students/transfer', allowAdmin, checkSubscription, transferStudent);
router.put('/students/:id/reset-password', allowAdmin, checkSubscription, resetStudentPassword);

// ── Bulk Import routes ───────────────────────────────────────────────────────
// Template downloads
router.get('/students/import/template', allowAdmin, downloadStudentTemplate);
router.get('/exams/import/template', allowAdmin, downloadExamTemplate);
// Actual imports — multer parses the multipart/form-data upload into req.file
router.post('/students/import', allowAdmin, checkSubscription, uploadExcel, importStudents);
router.post('/exams/import', allowAdmin, checkSubscription, uploadExcel, importExamResults);
// Credential management
router.post('/students/generate-credentials', allowAdmin, checkSubscription, generateBulkCredentials);
router.post('/students/:id/generate-login', allowAdmin, checkSubscription, generateStudentLogin);
// Download endpoints (POST to accept body payload)
router.post('/students/credentials/download', allowAdmin, downloadCredentials);
router.post('/students/errors/download', allowAdmin, downloadStudentErrorReport);
router.post('/exams/errors/download', allowAdmin, downloadExamErrorReport);
// ─────────────────────────────────────────────────────────────────────────────

// Teacher routes
router.get('/teachers/check-id', allowAdmin, checkTeacherId);
router.get('/teachers/import/template', allowAdmin, downloadTeacherTemplate);
router.post('/teachers/import', allowAdmin, checkSubscription, uploadExcel, importTeachers);
router.post('/teachers/errors/download', allowAdmin, downloadTeacherErrorReport);
router.route('/teachers')
  .post(allowAdmin, checkSubscription, createTeacher)
  .get(authorize('admin', 'schooladmin', 'teacher'), getTeachers);
router.route('/teachers/:id')
  .put(allowAdmin, checkSubscription, updateTeacher)
  .delete(allowAdmin, checkSubscription, deleteTeacher);
router.put('/teachers/:id/reset-password', allowAdmin, checkSubscription, resetTeacherPassword);

// Class routes
router.route('/classes')
  .post(allowAdmin, checkSubscription, createClass)
  .get(authorize('admin', 'schooladmin', 'teacher', 'student'), getClasses);
router.route('/classes/:id')
  .get(authorize('admin', 'schooladmin', 'teacher', 'student'), getClassById)
  .put(allowAdmin, checkSubscription, updateClass)
  .delete(allowAdmin, checkSubscription, deleteClass);
router.get('/class-students/:classId', authorize('admin', 'schooladmin', 'teacher'), getStudentsInClass);
router.post('/classes/:classId/subjects', allowAdmin, checkSubscription, assignSubjectToClass);
router.put('/class-subjects/:id', allowAdmin, checkSubscription, updateClassSubjectAssignment);
router.delete('/class-subjects/:id', allowAdmin, checkSubscription, removeClassSubjectAssignment);

// Subject routes
router.route('/subjects')
  .post(allowAdmin, checkSubscription, createSubject)
  .get(authorize('admin', 'schooladmin', 'school_admin', 'teacher'), getSubjects);
router.get('/subjects/check-code', allowAdmin, checkSubjectCode);
router.route('/subjects/:id')
  .put(allowAdmin, checkSubscription, updateSubject)
  .delete(allowAdmin, checkSubscription, deleteSubject);

// Attendance routes - Block modifications if subscription expired
router.get('/attendance', allowAdmin, getAllAttendance);
router.post('/take-attendance', allowAdmin, checkSubscription, takeAttendance);
router.route('/attendance/:id')
  .put(allowAdmin, checkSubscription, updateAttendance)
  .delete(allowAdmin, checkSubscription, deleteAttendance);

// Exam Session routes (New Horizontal Marks Entry)
router.route('/exam-sessions')
  .post(allowAdmin, checkSubscription, createExamSession)
  .get(authorize('admin', 'schooladmin', 'school_admin', 'teacher'), getExamSessions);
router.get('/exam-sessions/:id', authorize('admin', 'schooladmin', 'school_admin', 'teacher'), getExamSessionById);
router.get('/exam-sessions/:examSessionId/class/:classId/marks', authorize('admin', 'schooladmin', 'school_admin', 'teacher'), getClassExamMarks);
router.post('/exam-sessions/marks', authorize('admin', 'schooladmin', 'school_admin', 'teacher'), checkSubscription, submitClassExamMarks);
router.delete('/exam-sessions/marks', allowAdmin, checkSubscription, deleteClassExamMarks);

// Legacy payment route (old Payment model)
router.get('/payments', allowAdmin, getAllPayments);

// ── Monthly Payment Management - Block modifications ──────────────────────────
router.route('/payment-months')
  .post(allowAdmin, checkSubscription, createPaymentMonth)
  .get(authorize('admin', 'schooladmin', 'school_admin', 'student'), getPaymentMonths);

router.delete('/payment-months/:id', allowAdmin, checkSubscription, deletePaymentMonth);

router.get('/monthly-payments', authorize('admin', 'schooladmin', 'school_admin', 'teacher'), getMonthlyPayments);
router.put('/monthly-payments/:id/mark-paid', allowAdmin, checkSubscription, markPaymentPaid);
router.put('/monthly-payments/:id/mark-unpaid', allowAdmin, checkSubscription, markPaymentUnpaid);
router.get('/payment-matrix', allowAdmin, getPaymentMatrix);
router.post('/generate-monthly-payments', allowAdmin, checkSubscription, generateMonthlyPaymentsManual);
router.get('/payment-stats', allowAdmin, getPaymentStats);
// ─────────────────────────────────────────────────────────────────────────────

// Exam & Marks routes - Block modifications
router.route('/exams')
  .get(authorize('admin', 'schooladmin', 'school_admin', 'teacher'), getAllExams)
  .post(allowAdmin, checkSubscription, createExam);
router.put('/exams/:id/publish', allowAdmin, checkSubscription, publishExam);
router.get('/exams/:id/marks', allowAdmin, getExamMarks);
router.put('/exams/:id/marks', allowAdmin, checkSubscription, updateExamMarks);

router.get('/marks', authorize('admin', 'schooladmin', 'school_admin', 'teacher'), getAllMarks);
router.post('/bulk-submit-marks', authorize('admin', 'schooladmin', 'school_admin', 'teacher'), bulkSubmitMarks);
router.get('/class-results/:classId', authorize('admin', 'schooladmin', 'school_admin', 'teacher', 'student'), getClassResults);

// Schedule routes - Block modifications
router.route('/schedules')
  .get(authorize('admin', 'schooladmin', 'school_admin', 'teacher', 'student'), getSchedules)
  .post(allowAdmin, checkSubscription, createSchedule);
router.route('/schedules/:id')
  .put(allowAdmin, checkSubscription, updateSchedule)
  .delete(allowAdmin, checkSubscription, deleteSchedule);

// Dashboard statistics (read-only, no subscription check needed)
router.get('/dashboard-stats', allowAdmin, getDashboardStats);
router.get('/teacher-dashboard-stats', authorize('admin', 'schooladmin', 'school_admin', 'teacher'), getTeacherDashboardStats);

// Exam Request routes
router.get('/exam-requests', allowAdmin, getExamRequests);
router.put('/exam-requests/:examId/approve', allowAdmin, checkSubscription, approveExamRequest);

// Student Search & Results (read-only, no subscription check needed)
router.get('/student-profile/:customId', getStudentProfile);
router.get('/student-profile-for-print/:id', getStudentProfileForPrint);
router.get('/teacher-profile/:customId', getTeacherProfile);
router.get('/class-results/:classId/:examName', getClassResults);
router.post('/bulk-submit-marks', bulkSubmitMarks);
router.get('/academic-summary/:studentId', getStudentAcademicSummary);

// School Settings - Allow viewing but block modifications if blocked
router.route('/school-settings')
  .get(allowAdmin, getSchoolSettings)
  .put(allowAdmin, checkSubscription, updateSchoolSettings);

// Announcement routes
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../controllers/adminController.js';

router.route('/announcements')
  .get(authorize('admin', 'schooladmin', 'school_admin', 'teacher', 'student'), getAnnouncements)
  .post(allowAdmin, checkSubscription, createAnnouncement);
router.route('/announcements/:id')
  .put(allowAdmin, checkSubscription, updateAnnouncement)
  .delete(allowAdmin, checkSubscription, deleteAnnouncement);

export default router;
