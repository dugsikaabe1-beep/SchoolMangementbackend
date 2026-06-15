import express from 'express';
import { protect, checkPermission, allowParent } from '../middlewares/authMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { getAuditLogs, getFinanceAuditLogs } from '../controllers/auditController.js';
import { getActivityFeed } from '../controllers/activityController.js';
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  restoreDocument,
} from '../controllers/documentController.js';
import {
  getParentChildren,
  getChildProfile,
  getChildAttendance,
  getChildResults,
  getChildFees,
  getChildTimetable,
  getParentAnnouncements,
  linkParentToStudents,
} from '../controllers/parentController.js';
import { createBackup, getBackups, restoreBackup, verifyBackup } from '../controllers/backupController.js';
import { exportData } from '../controllers/exportController.js';
import { getOnboardingStatus, completeOnboardingStep } from '../controllers/onboardingController.js';
import { getPromotionHistory } from '../controllers/academicController.js';
import {
  getNotificationTemplates,
  getNotificationTemplateById,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  seedSystemTemplates
} from '../controllers/notificationTemplateController.js';
import {
  getDeletedRecords,
  restoreRecord,
  getRecoverySummary,
  permanentDeleteRecord
} from '../controllers/dataRecoveryController.js';
import {
  checkDuplicates,
  checkBulkDuplicates
} from '../controllers/duplicateDetectionController.js';
import {
  getEnterpriseOverview,
  getTranscript,
  exportTranscript,
  exportTranscriptPdf,
  getStudentLifecycle,
  getTeacherPerformance,
  getStudentRisk,
  listConsents,
  createConsent,
  updateConsent,
  deleteConsent,
  respondConsent,
  listScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  getStorageUsage,
  getApiActivity,
  getFeeForecast,
  getSmartDefaulters,
  listArchives,
  createArchive,
  restoreArchive,
  exportEnterpriseReport
} from '../controllers/enterpriseFinalController.js';

const router = express.Router();

router.use(protect);
router.use(checkSubscription);

// Audit & Activity Center
router.use('/audit-logs', checkModuleAccess('audit-logs'));
router.use('/finance-audit-logs', checkModuleAccess('audit-logs'));
router.use('/activity-feed', checkModuleAccess('audit-logs'));
router.get('/audit-logs', checkPermission('settings.view'), branchIsolation, getAuditLogs);
router.get('/finance-audit-logs', checkPermission('finance.view'), branchIsolation, getFinanceAuditLogs);
router.get('/activity-feed', checkPermission('settings.view'), branchIsolation, getActivityFeed);

// Document Management
router.use('/documents', checkModuleAccess('documents'));
router.route('/documents')
  .get(checkPermission('settings.view'), branchIsolation, getDocuments)
  .post(checkPermission('settings.manage'), branchIsolation, createDocument);

router.route('/documents/:id')
  .put(checkPermission('settings.manage'), branchIsolation, updateDocument)
  .delete(checkPermission('settings.manage'), branchIsolation, deleteDocument);

router.post('/documents/:id/restore', checkPermission('settings.manage'), branchIsolation, restoreDocument);

// Backup & Recovery
router.use('/backups', checkModuleAccess('backups'));
router.get('/backups', checkPermission('settings.manage'), getBackups);
router.post('/backups', checkPermission('settings.manage'), createBackup);
router.post('/backups/restore', checkPermission('settings.manage'), restoreBackup);
router.get('/backups/:fileName/verify', checkPermission('settings.manage'), verifyBackup);

// Export Center
router.use('/export', checkModuleAccess('export'));
router.get('/export/:entity', checkPermission('settings.view'), branchIsolation, exportData);

// Onboarding Wizard
router.use('/onboarding', checkModuleAccess('onboarding'));
router.get('/onboarding/status', checkPermission('settings.manage'), getOnboardingStatus);
router.post('/onboarding/step/:stepName', checkPermission('settings.manage'), completeOnboardingStep);

// Promotion history
router.use('/promotion-history', checkModuleAccess('promotions'));
router.get('/promotion-history', checkPermission('students.view'), branchIsolation, getPromotionHistory);

// Notification Templates
router.use('/notification-templates', checkModuleAccess('notifications'));
router.route('/notification-templates')
  .get(checkPermission('settings.view'), branchIsolation, getNotificationTemplates)
  .post(checkPermission('settings.manage'), branchIsolation, createNotificationTemplate);

router.route('/notification-templates/:id')
  .get(checkPermission('settings.view'), branchIsolation, getNotificationTemplateById)
  .put(checkPermission('settings.manage'), branchIsolation, updateNotificationTemplate)
  .delete(checkPermission('settings.manage'), branchIsolation, deleteNotificationTemplate);

router.post('/notification-templates/seed', checkPermission('settings.manage'), branchIsolation, seedSystemTemplates);

// Data Recovery Center
router.use('/data-recovery', checkModuleAccess('data-recovery'));
router.get('/data-recovery/summary', checkPermission('settings.manage'), branchIsolation, getRecoverySummary);
router.get('/data-recovery/deleted/:type', checkPermission('settings.manage'), branchIsolation, getDeletedRecords);
router.post('/data-recovery/restore/:type/:id', checkPermission('settings.manage'), branchIsolation, restoreRecord);
router.delete('/data-recovery/permanent/:type/:id', checkPermission('settings.manage'), branchIsolation, permanentDeleteRecord);

// Duplicate Detection Engine
router.use('/duplicate-check', checkModuleAccess('duplicate-detection'));
router.post('/duplicate-check', checkPermission('settings.manage'), branchIsolation, checkDuplicates);
router.post('/duplicate-check/bulk', checkPermission('settings.manage'), branchIsolation, checkBulkDuplicates);

// Parent mobile APIs
router.use('/parent', checkModuleAccess('parent-app'));
router.get('/parent/children', allowParent, getParentChildren);
router.get('/parent/children/:studentId/profile', allowParent, getChildProfile);
router.get('/parent/children/:studentId/attendance', allowParent, getChildAttendance);
router.get('/parent/children/:studentId/results', allowParent, getChildResults);
router.get('/parent/children/:studentId/fees', allowParent, getChildFees);
router.get('/parent/children/:studentId/timetable', allowParent, getChildTimetable);
router.get('/parent/announcements', allowParent, getParentAnnouncements);

// Admin: link parent to students
router.post('/parent/link-students', checkModuleAccess('parent-app'), checkPermission('students.edit'), linkParentToStudents);

// Final enterprise enhancement pack
router.use('/final', checkModuleAccess('reports'));
router.get('/final/overview', checkPermission('settings.view'), branchIsolation, getEnterpriseOverview);
router.get('/final/transcripts/:studentId', checkPermission('students.view'), branchIsolation, getTranscript);
router.get('/final/transcripts/:studentId/export', checkPermission('students.view'), branchIsolation, exportTranscript);
router.get('/final/transcripts/:studentId/pdf', checkPermission('students.view'), branchIsolation, exportTranscriptPdf);
router.get('/final/students/:studentId/lifecycle', checkPermission('students.view'), branchIsolation, getStudentLifecycle);
router.get('/final/teacher-performance', checkPermission('teachers.view'), branchIsolation, getTeacherPerformance);
router.get('/final/student-risk', checkPermission('students.view'), branchIsolation, getStudentRisk);
router.get('/final/fee-forecast', checkPermission('finance.view'), branchIsolation, getFeeForecast);
router.get('/final/defaulters', checkPermission('finance.view'), branchIsolation, getSmartDefaulters);
router.get('/final/storage', checkPermission('settings.view'), branchIsolation, getStorageUsage);
router.get('/final/api-activity', checkPermission('settings.manage'), branchIsolation, getApiActivity);
router.get('/final/export/:type', checkPermission('settings.view'), branchIsolation, exportEnterpriseReport);

router.route('/final/consents')
  .get(checkPermission('students.view'), branchIsolation, listConsents)
  .post(checkPermission('students.edit'), branchIsolation, createConsent);
router.route('/final/consents/:id')
  .put(checkPermission('students.edit'), branchIsolation, updateConsent)
  .delete(checkPermission('students.edit'), branchIsolation, deleteConsent);
router.post('/final/consents/mobile/:token/respond', respondConsent);

router.route('/final/scheduled-reports')
  .get(checkPermission('settings.view'), branchIsolation, listScheduledReports)
  .post(checkPermission('settings.manage'), branchIsolation, createScheduledReport);
router.route('/final/scheduled-reports/:id')
  .put(checkPermission('settings.manage'), branchIsolation, updateScheduledReport)
  .delete(checkPermission('settings.manage'), branchIsolation, deleteScheduledReport);

router.route('/final/archives')
  .get(checkPermission('settings.view'), branchIsolation, listArchives)
  .post(checkPermission('settings.manage'), branchIsolation, createArchive);
router.post('/final/archives/:id/restore', checkPermission('settings.manage'), branchIsolation, restoreArchive);

export default router;
