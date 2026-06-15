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
  restoreStudent,
  transferStudent,
  createTeacher,
  getTeachers,
  updateTeacher,
  deleteTeacher,
  restoreTeacher,
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
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getExamMarks,
  updateExamMarks,
  getParents,
  createParent,
  updateParent,
  deleteParent,
  // Password reset
  resetTeacherPassword,
  resetStudentPassword,
  resetParentPassword,
  // Enterprise Features
  generateCertificate,
  getAdmissions,
  updateAdmissionStatus,
  promoteStudents,
  getCalendarEvents,
  createCalendarEvent,
  getUsageAnalytics,
  createSupportTicket,
  getSupportTickets,
  exportData,
  // Professional Expansion
  getFeeStructures,
  createFeeStructure,
  calculateStudentFee,
  requestApproval,
  handleApproval,
  getAssets,
  createAsset,
  getDiscounts,
  createDiscount,
  updateDiscount,
  getDiscountAssignments,
  assignDiscount,
  updateDiscountAssignment,
  removeDiscountAssignment,
  getDiscountReports,
  getLibraryBooks,
  createLibraryBook,
  issueLibraryBook,
  returnLibraryBook,
  getTransportRoutes,
  createTransportRoute,
  getTransportVehicles,
  createTransportVehicle,
  getActiveSessions,
  revokeSession,
  updateAsset,
  deleteAsset,
  updateLibraryBook,
  deleteLibraryBook,
  updateTransportRoute,
  deleteTransportRoute,
  updateTransportVehicle,
  deleteTransportVehicle,
  getCertificates,
  updateCertificate,
  deleteCertificate,
  getHostels,
  createHostel,
  updateHostel,
  deleteHostel,
  getHostelRooms,
  createHostelRoom,
  updateHostelRoom,
  deleteHostelRoom,
} from '../controllers/adminController.js';
import { linkParentToStudents } from '../controllers/parentController.js';
import { getStudentsInClass, takeAttendance } from '../controllers/teacherController.js';
import { 
  protect, 
  allowAdmin, 
  authorizeRoles,
  checkPermission 
} from '../middlewares/authMiddleware.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';
import { injectOwnership } from '../middlewares/tenantMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { checkPlanLimits } from '../middlewares/limitMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { globalSearch } from '../controllers/searchController.js';

const router = express.Router();

// Apply auth, ownership, branch isolation and academic year middleware to all routes
router.use(protect);
router.use(injectOwnership);
router.use(branchIsolation);
router.use(injectAcademicYear);
router.use(checkSubscription);
router.use(auditMiddleware('ADMIN_PANEL'));

// Global Search
router.get('/search', globalSearch);

// --- 1. Dashboard Stats ---
router.get('/dashboard-stats', authorizeRoles('admin', 'schooladmin', 'school_admin'), getDashboardStats);
router.get('/teacher-dashboard-stats', authorizeRoles('teacher'), getTeacherDashboardStats);

// --- 2. Student Management ---
router.use('/students', checkModuleAccess('students'));
router.use('/student-profile', checkModuleAccess('students'));
router.use('/student-profile-print', checkModuleAccess('students'));
router.use('/templates/students', checkModuleAccess('students'));
router.route('/students')
  .post(checkPermission('students.create'), checkPlanLimits('students'), createStudent)
  .get(checkPermission('students.view'), getStudents);

router.route('/students/:id')
  .put(checkPermission('students.edit'), updateStudent)
  .delete(checkPermission('students.delete'), deleteStudent);

router.post('/students/:id/restore', checkPermission('students.edit'), restoreStudent);

router.get('/student-profile/:customId', checkPermission('students.view'), getStudentProfile);
router.get('/student-profile-print/:id', checkPermission('students.view'), getStudentProfileForPrint);
router.post('/students/transfer', checkPermission('students.edit'), transferStudent);

// --- Parent Management ---
router.use('/parents', checkModuleAccess('parents'));
router.route('/parents')
  .get(checkPermission('students.view'), getParents)
  .post(checkPermission('students.create'), createParent);

router.route('/parents/:id')
  .put(checkPermission('students.edit'), updateParent)
  .delete(checkPermission('students.delete'), deleteParent);

router.post('/parents/link', checkPermission('students.edit'), linkParentToStudents);

// --- 3. Teacher Management ---
router.use('/teachers', checkModuleAccess('teachers'));
router.use('/teacher-profile', checkModuleAccess('teachers'));
router.use('/templates/teachers', checkModuleAccess('teachers'));
router.route('/teachers')
  .post(checkPermission('teachers.create'), checkPlanLimits('teachers'), createTeacher)
  .get(checkPermission('teachers.view'), getTeachers);

router.route('/teachers/:id')
  .put(checkPermission('teachers.edit'), updateTeacher)
  .delete(checkPermission('teachers.delete'), deleteTeacher);

router.post('/teachers/:id/restore', checkPermission('teachers.edit'), restoreTeacher);

router.get('/teacher-profile/:customId', checkPermission('teachers.view'), getTeacherProfile);
router.get('/teachers/check-id', checkPermission('teachers.view'), checkTeacherId);

// --- 4. Class Management ---
router.use('/classes', checkModuleAccess('classes'));
router.use('/class-students', checkModuleAccess('classes'));
router.route('/classes')
  .post(checkPermission('classes.create'), createClass)
  .get(checkPermission('classes.view'), getClasses);

router.route('/classes/:id')
  .get(checkPermission('classes.view'), getClassById)
  .put(checkPermission('classes.edit'), updateClass)
  .delete(checkPermission('classes.delete'), deleteClass);

router.get('/class-students/:classId', checkPermission('students.view'), getStudentsInClass);

// --- 5. Subject Management ---
router.use('/subjects', checkModuleAccess('subjects'));
router.route('/subjects')
  .post(checkPermission('subjects.create'), createSubject)
  .get(checkPermission('subjects.view'), getSubjects);

router.route('/subjects/:id')
  .put(checkPermission('subjects.edit'), updateSubject)
  .delete(checkPermission('subjects.delete'), deleteSubject);

router.get('/subjects/check-code', checkPermission('subjects.view'), checkSubjectCode);
router.post('/subjects/assign', checkPermission('subjects.edit'), assignSubjectToClass);
router.put('/subjects/assign/:id', checkPermission('subjects.edit'), updateClassSubjectAssignment);
router.delete('/subjects/assign/:id', checkPermission('subjects.edit'), removeClassSubjectAssignment);

// --- 6. Attendance Management ---
router.use('/attendance', checkModuleAccess('attendance'));
router.route('/attendance')
  .post(checkPermission('attendance.create'), takeAttendance)
  .get(checkPermission('attendance.view'), getAllAttendance);

router.route('/attendance/:id')
  .put(checkPermission('attendance.edit'), updateAttendance)
  .delete(checkPermission('attendance.delete'), deleteAttendance);

// --- 7. Exam Management ---
router.use('/exams', checkModuleAccess('exams'));
router.route('/exams')
  .post(checkPermission('exams.create'), createExam)
  .get(checkPermission('exams.view'), getAllExams);

router.post('/exams/:id/publish', checkPermission('exams.edit'), publishExam);

// --- 8. Marks Management ---
router.use('/marks', checkModuleAccess('exams'));
router.use('/exams/marks', checkModuleAccess('exams'));
router.use('/exams/bulk-submit', checkModuleAccess('exams'));
router.use('/class-results', checkModuleAccess('exams'));
router.use('/student-academic-summary', checkModuleAccess('exams'));
router.get('/marks', checkPermission('exams.view'), getAllMarks);
router.get('/exams/marks', checkPermission('exams.view'), getExamMarks);
router.put('/exams/marks', checkPermission('exams.edit'), updateExamMarks);
router.post('/exams/bulk-submit', checkPermission('exams.edit'), bulkSubmitMarks);
router.get('/class-results', checkPermission('exams.view'), getClassResults);
router.get('/student-academic-summary/:id', checkPermission('exams.view'), getStudentAcademicSummary);

// --- 9. Exam Session Management ---
router.use('/exam-sessions', checkModuleAccess('exams'));
router.route('/exam-sessions')
  .post(checkPermission('exams.create'), createExamSession)
  .get(checkPermission('exams.view'), getExamSessions);

router.get('/exam-sessions/:id', checkPermission('exams.view'), getExamSessionById);
router.get('/exam-sessions/:id/marks', checkPermission('exams.view'), getClassExamMarks);
router.post('/exam-sessions/:id/marks', checkPermission('exams.edit'), submitClassExamMarks);
router.delete('/exam-sessions/:id/marks/:studentId', checkPermission('exams.delete'), deleteClassExamMarks);

// --- 10. Payment & Finance Management ---
router.use('/payment-months', checkModuleAccess('finance'));
router.use('/monthly-payments', checkModuleAccess('finance'));
router.use('/payment-matrix', checkModuleAccess('finance'));
router.use('/generate-monthly-payments', checkModuleAccess('finance'));
router.use('/payment-stats', checkModuleAccess('finance'));
router.use('/finance', checkModuleAccess('finance'));
router.route('/payment-months')
  .post(checkPermission('finance.manage'), createPaymentMonth)
  .get(checkPermission('finance.view'), getPaymentMonths);

router.get('/monthly-payments', checkPermission('finance.view'), getMonthlyPayments);
router.put('/monthly-payments/:id/mark-paid', checkPermission('finance.manage'), markPaymentPaid);
router.put('/monthly-payments/:id/mark-unpaid', checkPermission('finance.manage'), markPaymentUnpaid);
router.get('/payment-matrix', checkPermission('finance.view'), getPaymentMatrix);
router.delete('/payment-months/:id', checkPermission('finance.manage'), deletePaymentMonth);
router.post('/generate-monthly-payments', checkPermission('finance.manage'), generateMonthlyPaymentsManual);
router.get('/payment-stats', checkPermission('finance.view'), getPaymentStats);
router.get('/finance/all-payments', checkPermission('finance.view'), getAllPayments);

// --- 11. Schedule Management ---
router.use('/schedules', checkModuleAccess('schedules'));
router.route('/schedules')
  .post(checkPermission('schedules.manage'), createSchedule)
  .get(checkPermission('schedules.view'), getSchedules);

router.route('/schedules/:id')
  .put(checkPermission('schedules.manage'), updateSchedule)
  .delete(checkPermission('schedules.manage'), deleteSchedule);

// --- 12. School Settings ---
router.use('/school-settings', checkModuleAccess('settings'));
router.route('/school-settings')
  .get(checkPermission('settings.view'), getSchoolSettings)
  .put(checkPermission('settings.manage'), updateSchoolSettings);

// --- Announcements ---
router.use('/announcements', checkModuleAccess('announcements'));
router.route('/announcements')
  .get(checkPermission('settings.view'), getAnnouncements)
  .post(checkPermission('settings.manage'), createAnnouncement);

router.route('/announcements/:id')
  .put(checkPermission('settings.manage'), updateAnnouncement)
  .delete(checkPermission('settings.manage'), deleteAnnouncement);

// --- 13. Bulk Import Management ---
router.post('/students/import', checkModuleAccess('students'), checkPermission('students.create'), uploadExcel, importStudents);
router.post('/exams/import', checkModuleAccess('exams'), checkPermission('exams.create'), uploadExcel, importExamResults);
router.post('/teachers/import', checkModuleAccess('teachers'), checkPermission('teachers.create'), uploadExcel, importTeachers);

router.get('/templates/students', checkPermission('students.create'), downloadStudentTemplate);
router.get('/templates/exams', checkModuleAccess('exams'), checkPermission('exams.create'), downloadExamTemplate);
router.get('/templates/teachers', checkPermission('teachers.create'), downloadTeacherTemplate);

router.post('/students/generate-credentials', checkPermission('students.edit'), generateBulkCredentials);
router.post('/students/:id/generate-login', checkPermission('students.edit'), generateStudentLogin);
router.post('/students/credentials/download', checkPermission('students.view'), downloadCredentials);
router.post('/students/errors/download', checkPermission('students.view'), downloadStudentErrorReport);
router.post('/exams/errors/download', checkModuleAccess('exams'), checkPermission('exams.view'), downloadExamErrorReport);
router.post('/teachers/errors/download', checkPermission('teachers.view'), downloadTeacherErrorReport);

// --- 14. Exam Access Requests ---
router.use('/exam-requests', checkModuleAccess('exams'));
router.get('/exam-requests', checkPermission('exams.manage'), getExamRequests);
router.post('/exam-requests/:id/approve', checkPermission('exams.manage'), approveExamRequest);

// --- 15. Password Reset ---
router.post('/teachers/:id/reset-password', checkPermission('teachers.edit'), resetTeacherPassword);
router.post('/students/:id/reset-password', checkPermission('students.edit'), resetStudentPassword);
router.post('/parents/:id/reset-password', checkPermission('students.edit'), resetParentPassword);

// --- 16. Enterprise Features ---
router.post('/certificates/generate', checkModuleAccess('certificates'), generateCertificate);
router.get('/admissions', checkModuleAccess('admissions'), getAdmissions);
router.put('/admissions/:id/status', checkModuleAccess('admissions'), updateAdmissionStatus);
router.post('/students/promote', checkModuleAccess('promotions'), promoteStudents);
router.get('/calendar-events', checkModuleAccess('academic-calendar'), getCalendarEvents);
router.post('/calendar-events', checkModuleAccess('academic-calendar'), createCalendarEvent);
router.get('/analytics/usage', checkModuleAccess('analytics'), getUsageAnalytics);
router.get('/support/tickets', checkModuleAccess('support'), getSupportTickets);
router.post('/support/tickets', checkModuleAccess('support'), createSupportTicket);
router.get('/export', checkModuleAccess('export'), exportData);

// --- 17. Professional School ERP Expansion ---
// Fees & Discounts
router.get('/fee-structures', checkModuleAccess('finance'), getFeeStructures);
router.post('/fee-structures', checkPermission('finance.manage'), createFeeStructure);
router.post('/calculate-fee', checkModuleAccess('finance'), calculateStudentFee);

// Approval Workflows
router.post('/approvals/request', requestApproval);
router.put('/approvals/:id/handle', handleApproval);

// Asset Management
router.get('/assets', checkModuleAccess('assets'), getAssets);
router.post('/assets', checkPermission('assets.manage'), createAsset);

// Discounts Management
router.get('/discounts', checkModuleAccess('discounts'), getDiscounts);
router.post('/discounts', checkPermission('finance.manage'), createDiscount);
router.put('/discounts/:id', checkPermission('finance.manage'), updateDiscount);
router.get('/discount-assignments', checkModuleAccess('discounts'), getDiscountAssignments);
router.post('/discount-assignments', checkPermission('finance.manage'), assignDiscount);
router.put('/discount-assignments/:id', checkPermission('finance.manage'), updateDiscountAssignment);
router.delete('/discount-assignments/:id', checkPermission('finance.manage'), removeDiscountAssignment);
router.get('/discount-reports', checkPermission('finance.view'), getDiscountReports);

// Library Management
router.get('/library/books', checkModuleAccess('library'), getLibraryBooks);
router.post('/library/books', checkPermission('library.manage'), createLibraryBook);
router.post('/library/issues', checkPermission('library.manage'), issueLibraryBook);
router.put('/library/issues/:id/return', checkPermission('library.manage'), returnLibraryBook);

// Transport Management
router.get('/transport/routes', checkModuleAccess('transport'), getTransportRoutes);
router.post('/transport/routes', checkPermission('transport.manage'), createTransportRoute);
router.get('/transport/vehicles', checkModuleAccess('transport'), getTransportVehicles);
router.post('/transport/vehicles', checkPermission('transport.manage'), createTransportVehicle);

// Security & Sessions
router.get('/security/sessions', getActiveSessions);
router.delete('/security/sessions/:sessionId', revokeSession);

// Asset CRUD additions
router.route('/assets/:id')
  .put(checkPermission('assets.manage'), updateAsset)
  .delete(checkPermission('assets.manage'), deleteAsset);

// Library CRUD additions
router.route('/library/books/:id')
  .put(checkPermission('library.manage'), updateLibraryBook)
  .delete(checkPermission('library.manage'), deleteLibraryBook);

// Transport CRUD additions
router.route('/transport/routes/:id')
  .put(checkPermission('transport.manage'), updateTransportRoute)
  .delete(checkPermission('transport.manage'), deleteTransportRoute);

router.route('/transport/vehicles/:id')
  .put(checkPermission('transport.manage'), updateTransportVehicle)
  .delete(checkPermission('transport.manage'), deleteTransportVehicle);

// Certificate CRUD additions
router.get('/certificates', checkModuleAccess('certificates'), getCertificates);
router.put('/certificates/:id', checkModuleAccess('certificates'), updateCertificate);
router.delete('/certificates/:id', checkModuleAccess('certificates'), deleteCertificate);

// Hostel Management
router.use('/hostels', checkModuleAccess('hostel'));
router.route('/hostels')
  .get(getHostels)
  .post(checkPermission('hostel.manage'), createHostel);
router.route('/hostels/:id')
  .put(checkPermission('hostel.manage'), updateHostel)
  .delete(checkPermission('hostel.manage'), deleteHostel);
router.route('/hostels/:hostelId/rooms')
  .get(getHostelRooms)
  .post(checkPermission('hostel.manage'), createHostelRoom);
router.route('/hostels/rooms/:id')
  .put(checkPermission('hostel.manage'), updateHostelRoom)
  .delete(checkPermission('hostel.manage'), deleteHostelRoom);

export default router;
