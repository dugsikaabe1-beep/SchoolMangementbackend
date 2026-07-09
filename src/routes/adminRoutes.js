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
  getUsersForIDCard,
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
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { checkBranchAccess } from '../middlewares/branchContext.js';
import { injectOwnership, injectBranch } from '../middlewares/tenantMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { checkPlanLimits } from '../middlewares/limitMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { globalSearch } from '../controllers/searchController.js';

const router = express.Router();

// Apply auth, ownership, branch isolation and academic year middleware to all routes
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(asyncHandler(checkBranchAccess));
router.use(asyncHandler(injectAcademicYear));
router.use(checkSubscription);
router.use(auditMiddleware('ADMIN_PANEL'));

// Global Search
router.get('/search', asyncHandler(globalSearch));

// --- 1. Dashboard Stats ---
router.get('/dashboard-stats', authorizeRoles('admin', 'schooladmin', 'school_admin'), asyncHandler(getDashboardStats));
router.get('/teacher-dashboard-stats', authorizeRoles('teacher'), asyncHandler(getTeacherDashboardStats));

// --- 2. Student Management ---
router.use('/students', checkModuleAccess('students'));
router.use('/student-profile', checkModuleAccess('students'));
router.use('/student-profile-print', checkModuleAccess('students'));
router.use('/templates/students', checkModuleAccess('students'));
router.route('/students')
  .post(checkPermission('students.create'), checkPlanLimits('students'), asyncHandler(createStudent))
  .get(checkPermission('students.view'), asyncHandler(getStudents));

router.route('/students/:id')
  .put(checkPermission('students.edit'), asyncHandler(updateStudent))
  .delete(checkPermission('students.delete'), asyncHandler(deleteStudent));

router.post('/students/:id/restore', checkPermission('students.edit'), asyncHandler(restoreStudent));

router.get('/student-profile/:customId', checkPermission('students.view'), asyncHandler(getStudentProfile));
router.get('/student-profile-print/:id', checkPermission('students.view'), asyncHandler(getStudentProfileForPrint));
router.post('/students/transfer', checkPermission('students.edit'), asyncHandler(transferStudent));

// --- Parent Management ---
router.use('/parents', checkModuleAccess('parents'));
router.route('/parents')
  .get(checkPermission('students.view'), asyncHandler(getParents))
  .post(checkPermission('students.create'), asyncHandler(createParent));

router.route('/parents/:id')
  .put(checkPermission('students.edit'), asyncHandler(updateParent))
  .delete(checkPermission('students.delete'), asyncHandler(deleteParent));

router.post('/parents/link', checkPermission('students.edit'), asyncHandler(linkParentToStudents));

// --- 3. Teacher Management ---
router.use('/teachers', checkModuleAccess('teachers'));
router.use('/teacher-profile', checkModuleAccess('teachers'));
router.use('/templates/teachers', checkModuleAccess('teachers'));
router.route('/teachers')
  .post(checkPermission('teachers.create'), checkPlanLimits('teachers'), asyncHandler(createTeacher))
  .get(checkPermission('teachers.view'), asyncHandler(getTeachers));

router.route('/teachers/:id')
  .put(checkPermission('teachers.edit'), asyncHandler(updateTeacher))
  .delete(checkPermission('teachers.delete'), asyncHandler(deleteTeacher));

router.post('/teachers/:id/restore', checkPermission('teachers.edit'), asyncHandler(restoreTeacher));

router.get('/teacher-profile/:customId', checkPermission('teachers.view'), asyncHandler(getTeacherProfile));
router.get('/teachers/check-id', checkPermission('teachers.view'), asyncHandler(checkTeacherId));

// --- ID Card Users ---
router.get('/users-for-id-card', checkPermission('students.view'), asyncHandler(getUsersForIDCard));

// --- 4. Class Management ---
router.use('/classes', checkModuleAccess('classes'));
router.use('/class-students', checkModuleAccess('classes'));
router.route('/classes')
  .post(checkPermission('classes.create'), asyncHandler(createClass))
  .get(checkPermission('classes.view'), asyncHandler(getClasses));

router.route('/classes/:id')
  .get(checkPermission('classes.view'), asyncHandler(getClassById))
  .put(checkPermission('classes.edit'), asyncHandler(updateClass))
  .delete(checkPermission('classes.delete'), asyncHandler(deleteClass));

router.get('/class-students/:classId', checkPermission('students.view'), asyncHandler(getStudentsInClass));

// --- 5. Subject Management ---
router.use('/subjects', checkModuleAccess('subjects'));
router.route('/subjects')
  .post(checkPermission('subjects.create'), asyncHandler(createSubject))
  .get(checkPermission('subjects.view'), asyncHandler(getSubjects));

router.route('/subjects/:id')
  .put(checkPermission('subjects.edit'), asyncHandler(updateSubject))
  .delete(checkPermission('subjects.delete'), asyncHandler(deleteSubject));

router.get('/subjects/check-code', checkPermission('subjects.view'), asyncHandler(checkSubjectCode));
router.post('/subjects/assign', checkPermission('subjects.edit'), asyncHandler(assignSubjectToClass));
router.put('/subjects/assign/:id', checkPermission('subjects.edit'), asyncHandler(updateClassSubjectAssignment));
router.delete('/subjects/assign/:id', checkPermission('subjects.edit'), asyncHandler(removeClassSubjectAssignment));

// --- 6. Attendance Management ---
router.use('/attendance', checkModuleAccess('attendance'));
router.route('/attendance')
  .post(checkPermission('attendance.create'), asyncHandler(takeAttendance))
  .get(checkPermission('attendance.view'), asyncHandler(getAllAttendance));

router.route('/attendance/:id')
  .put(checkPermission('attendance.edit'), asyncHandler(updateAttendance))
  .delete(checkPermission('attendance.delete'), asyncHandler(deleteAttendance));

// --- 7. Exam Management ---
router.use('/exams', checkModuleAccess('exams'));
router.route('/exams')
  .post(checkPermission('exams.create'), asyncHandler(createExam))
  .get(checkPermission('exams.view'), asyncHandler(getAllExams));

router.post('/exams/:id/publish', checkPermission('exams.edit'), asyncHandler(publishExam));

// --- 8. Marks Management ---
router.use('/marks', checkModuleAccess('exams'));
router.use('/exams/marks', checkModuleAccess('exams'));
router.use('/exams/bulk-submit', checkModuleAccess('exams'));
router.use('/class-results', checkModuleAccess('exams'));
router.use('/student-academic-summary', checkModuleAccess('exams'));
router.get('/marks', checkPermission('exams.view'), asyncHandler(getAllMarks));
router.get('/exams/marks', checkPermission('exams.view'), asyncHandler(getExamMarks));
router.put('/exams/marks', checkPermission('exams.edit'), asyncHandler(updateExamMarks));
router.post('/exams/bulk-submit', checkPermission('exams.edit'), asyncHandler(bulkSubmitMarks));
router.get('/class-results', checkPermission('exams.view'), asyncHandler(getClassResults));
router.get('/student-academic-summary/:id', checkPermission('exams.view'), asyncHandler(getStudentAcademicSummary));

// --- 9. Exam Session Management ---
router.use('/exam-sessions', checkModuleAccess('exams'));
router.route('/exam-sessions')
  .post(checkPermission('exams.create'), asyncHandler(createExamSession))
  .get(checkPermission('exams.view'), asyncHandler(getExamSessions));

router.get('/exam-sessions/:id', checkPermission('exams.view'), asyncHandler(getExamSessionById));
router.get('/exam-sessions/:id/marks', checkPermission('exams.view'), asyncHandler(getClassExamMarks));
router.post('/exam-sessions/:id/marks', checkPermission('exams.edit'), asyncHandler(submitClassExamMarks));
router.delete('/exam-sessions/:id/marks/:studentId', checkPermission('exams.delete'), asyncHandler(deleteClassExamMarks));

// --- 10. Payment & Finance Management ---
router.use('/payment-months', checkModuleAccess('finance'));
router.use('/monthly-payments', checkModuleAccess('finance'));
router.use('/payment-matrix', checkModuleAccess('finance'));
router.use('/generate-monthly-payments', checkModuleAccess('finance'));
router.use('/payment-stats', checkModuleAccess('finance'));
router.use('/finance', checkModuleAccess('finance'));
router.route('/payment-months')
  .post(checkPermission('finance.manage'), asyncHandler(createPaymentMonth))
  .get(checkPermission('finance.view'), asyncHandler(getPaymentMonths));

router.get('/monthly-payments', checkPermission('finance.view'), asyncHandler(getMonthlyPayments));
router.put('/monthly-payments/:id/mark-paid', checkPermission('finance.manage'), asyncHandler(markPaymentPaid));
router.put('/monthly-payments/:id/mark-unpaid', checkPermission('finance.manage'), asyncHandler(markPaymentUnpaid));
router.get('/payment-matrix', checkPermission('finance.view'), asyncHandler(getPaymentMatrix));
router.delete('/payment-months/:id', checkPermission('finance.manage'), asyncHandler(deletePaymentMonth));
router.post('/generate-monthly-payments', checkPermission('finance.manage'), asyncHandler(generateMonthlyPaymentsManual));
router.get('/payment-stats', checkPermission('finance.view'), asyncHandler(getPaymentStats));
router.get('/finance/all-payments', checkPermission('finance.view'), asyncHandler(getAllPayments));

// --- 11. Schedule Management ---
router.use('/schedules', checkModuleAccess('schedules'));
router.route('/schedules')
  .post(checkPermission('schedules.manage'), asyncHandler(createSchedule))
  .get(checkPermission('schedules.view'), asyncHandler(getSchedules));

router.route('/schedules/:id')
  .put(checkPermission('schedules.manage'), asyncHandler(updateSchedule))
  .delete(checkPermission('schedules.manage'), asyncHandler(deleteSchedule));

// --- 12. School Settings ---
router.use('/school-settings', checkModuleAccess('settings'));
router.route('/school-settings')
  .get(checkPermission('settings.view'), asyncHandler(getSchoolSettings))
  .put(checkPermission('settings.manage'), asyncHandler(updateSchoolSettings));

// --- Announcements ---
router.use('/announcements', checkModuleAccess('announcements'));
router.route('/announcements')
  .get(checkPermission('settings.view'), asyncHandler(getAnnouncements))
  .post(checkPermission('settings.manage'), asyncHandler(createAnnouncement));

router.route('/announcements/:id')
  .put(checkPermission('settings.manage'), asyncHandler(updateAnnouncement))
  .delete(checkPermission('settings.manage'), asyncHandler(deleteAnnouncement));

// --- 13. Bulk Import Management ---
router.post('/students/import', checkModuleAccess('students'), checkPermission('students.create'), uploadExcel, asyncHandler(importStudents));
router.post('/exams/import', checkModuleAccess('exams'), checkPermission('exams.create'), uploadExcel, asyncHandler(importExamResults));
router.post('/teachers/import', checkModuleAccess('teachers'), checkPermission('teachers.create'), uploadExcel, asyncHandler(importTeachers));

router.get('/templates/students', checkPermission('students.create'), asyncHandler(downloadStudentTemplate));
router.get('/templates/exams', checkModuleAccess('exams'), checkPermission('exams.create'), asyncHandler(downloadExamTemplate));
router.get('/templates/teachers', checkPermission('teachers.create'), asyncHandler(downloadTeacherTemplate));

router.post('/students/generate-credentials', checkPermission('students.edit'), asyncHandler(generateBulkCredentials));
router.post('/students/:id/generate-login', checkPermission('students.edit'), asyncHandler(generateStudentLogin));
router.post('/students/credentials/download', checkPermission('students.view'), asyncHandler(downloadCredentials));
router.post('/students/errors/download', checkPermission('students.view'), asyncHandler(downloadStudentErrorReport));
router.post('/exams/errors/download', checkModuleAccess('exams'), checkPermission('exams.view'), asyncHandler(downloadExamErrorReport));
router.post('/teachers/errors/download', checkPermission('teachers.view'), asyncHandler(downloadTeacherErrorReport));

// --- 14. Exam Access Requests ---
router.use('/exam-requests', checkModuleAccess('exams'));
router.get('/exam-requests', checkPermission('exams.manage'), asyncHandler(getExamRequests));
router.post('/exam-requests/:id/approve', checkPermission('exams.manage'), asyncHandler(approveExamRequest));

// --- 15. Password Reset ---
router.post('/teachers/:id/reset-password', checkPermission('teachers.edit'), asyncHandler(resetTeacherPassword));
router.post('/students/:id/reset-password', checkPermission('students.edit'), asyncHandler(resetStudentPassword));
router.post('/parents/:id/reset-password', checkPermission('students.edit'), asyncHandler(resetParentPassword));

// --- 16. Enterprise Features ---
router.post('/certificates/generate', checkModuleAccess('certificates'), asyncHandler(generateCertificate));
router.get('/admissions', checkModuleAccess('admissions'), asyncHandler(getAdmissions));
router.put('/admissions/:id/status', checkModuleAccess('admissions'), asyncHandler(updateAdmissionStatus));
router.post('/students/promote', checkModuleAccess('promotions'), asyncHandler(promoteStudents));
router.get('/calendar-events', checkModuleAccess('academic-calendar'), asyncHandler(getCalendarEvents));
router.post('/calendar-events', checkModuleAccess('academic-calendar'), asyncHandler(createCalendarEvent));
router.get('/analytics/usage', checkModuleAccess('analytics'), asyncHandler(getUsageAnalytics));
router.get('/support/tickets', checkModuleAccess('support'), asyncHandler(getSupportTickets));
router.post('/support/tickets', checkModuleAccess('support'), asyncHandler(createSupportTicket));
router.get('/export', checkModuleAccess('export'), asyncHandler(exportData));

// --- 17. Professional School ERP Expansion ---
// Fees & Discounts
router.get('/fee-structures', checkModuleAccess('finance'), asyncHandler(getFeeStructures));
router.post('/fee-structures', checkPermission('finance.manage'), asyncHandler(createFeeStructure));
router.post('/calculate-fee', checkModuleAccess('finance'), asyncHandler(calculateStudentFee));

// Approval Workflows
router.post('/approvals/request', asyncHandler(requestApproval));
router.put('/approvals/:id/handle', asyncHandler(handleApproval));

// Asset Management
router.get('/assets', checkModuleAccess('assets'), asyncHandler(getAssets));
router.post('/assets', checkPermission('assets.manage'), asyncHandler(createAsset));

// Discounts Management
router.get('/discounts', checkModuleAccess('discounts'), asyncHandler(getDiscounts));
router.post('/discounts', checkPermission('finance.manage'), asyncHandler(createDiscount));
router.put('/discounts/:id', checkPermission('finance.manage'), asyncHandler(updateDiscount));
router.get('/discount-assignments', checkModuleAccess('discounts'), asyncHandler(getDiscountAssignments));
router.post('/discount-assignments', checkPermission('finance.manage'), asyncHandler(assignDiscount));
router.put('/discount-assignments/:id', checkPermission('finance.manage'), asyncHandler(updateDiscountAssignment));
router.delete('/discount-assignments/:id', checkPermission('finance.manage'), asyncHandler(removeDiscountAssignment));
router.get('/discount-reports', checkPermission('finance.view'), asyncHandler(getDiscountReports));

// Library Management
router.get('/library/books', checkModuleAccess('library'), asyncHandler(getLibraryBooks));
router.post('/library/books', checkPermission('library.manage'), asyncHandler(createLibraryBook));
router.post('/library/issues', checkPermission('library.manage'), asyncHandler(issueLibraryBook));
router.put('/library/issues/:id/return', checkPermission('library.manage'), asyncHandler(returnLibraryBook));

// Transport Management
router.get('/transport/routes', checkModuleAccess('transport'), asyncHandler(getTransportRoutes));
router.post('/transport/routes', checkPermission('transport.manage'), asyncHandler(createTransportRoute));
router.get('/transport/vehicles', checkModuleAccess('transport'), asyncHandler(getTransportVehicles));
router.post('/transport/vehicles', checkPermission('transport.manage'), asyncHandler(createTransportVehicle));

// Security & Sessions
router.get('/security/sessions', asyncHandler(getActiveSessions));
router.delete('/security/sessions/:sessionId', asyncHandler(revokeSession));

// Asset CRUD additions
router.route('/assets/:id')
  .put(checkPermission('assets.manage'), asyncHandler(updateAsset))
  .delete(checkPermission('assets.manage'), asyncHandler(deleteAsset));

// Library CRUD additions
router.route('/library/books/:id')
  .put(checkPermission('library.manage'), asyncHandler(updateLibraryBook))
  .delete(checkPermission('library.manage'), asyncHandler(deleteLibraryBook));

// Transport CRUD additions
router.route('/transport/routes/:id')
  .put(checkPermission('transport.manage'), asyncHandler(updateTransportRoute))
  .delete(checkPermission('transport.manage'), asyncHandler(deleteTransportRoute));

router.route('/transport/vehicles/:id')
  .put(checkPermission('transport.manage'), asyncHandler(updateTransportVehicle))
  .delete(checkPermission('transport.manage'), asyncHandler(deleteTransportVehicle));

// Certificate CRUD additions
router.get('/certificates', checkModuleAccess('certificates'), asyncHandler(getCertificates));
router.put('/certificates/:id', checkModuleAccess('certificates'), asyncHandler(updateCertificate));
router.delete('/certificates/:id', checkModuleAccess('certificates'), asyncHandler(deleteCertificate));

// Hostel Management
router.use('/hostels', checkModuleAccess('hostel'));
router.route('/hostels')
  .get(asyncHandler(getHostels))
  .post(checkPermission('hostel.manage'), asyncHandler(createHostel));
router.route('/hostels/:id')
  .put(checkPermission('hostel.manage'), asyncHandler(updateHostel))
  .delete(checkPermission('hostel.manage'), asyncHandler(deleteHostel));
router.route('/hostels/:hostelId/rooms')
  .get(asyncHandler(getHostelRooms))
  .post(checkPermission('hostel.manage'), asyncHandler(createHostelRoom));
router.route('/hostels/rooms/:id')
  .put(checkPermission('hostel.manage'), asyncHandler(updateHostelRoom))
  .delete(checkPermission('hostel.manage'), asyncHandler(deleteHostelRoom));

export default router;
