import express from 'express';
import {
  getCommunicationMessages,
  getCommunicationMessageById,
  createCommunicationMessage,
  updateCommunicationMessage,
  deleteCommunicationMessage,
  duplicateCommunicationMessage,
  previewMessage,
  sendCommunicationMessage,
  getCommunicationUsage,
  getCommunicationHealth,
  getDeliveryReports,
  getInvalidContacts,
  resolveInvalidContact,
  getUserCommunicationPreferences,
  updateUserCommunicationPreferences,
  getSmartRecipientFilters,
  globalSearch,
  sendSingleNotification,
  sendBroadcastNotification,
  sendClassParentNotification,
  getUserNotifications,
  markNotificationAsRead,
  getNotificationDeliveryLogs,
  searchRecipients
} from '../controllers/communicationController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { injectOwnership } from '../middlewares/tenantMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';

const router = express.Router();

// All routes require authentication and tenant context
router.use(protect);
router.use(injectOwnership);
router.use(branchIsolation);

// ==============================================
// COMMUNICATION MESSAGES
// ==============================================

router.get('/messages', getCommunicationMessages);
router.get('/messages/:id', getCommunicationMessageById);
router.post('/messages', createCommunicationMessage);
router.put('/messages/:id', updateCommunicationMessage);
router.delete('/messages/:id', deleteCommunicationMessage);
router.post('/messages/:id/duplicate', duplicateCommunicationMessage);
router.post('/messages/:id/send', sendCommunicationMessage);
router.post('/preview', previewMessage);

// ==============================================
// COMMUNICATION HEALTH DASHBOARD
// ==============================================
router.get('/health', getCommunicationHealth);

// ==============================================
// DELIVERY REPORTS
// ==============================================
router.get('/delivery-reports', getDeliveryReports);

// ==============================================
// INVALID CONTACTS MANAGEMENT
// ==============================================
router.get('/invalid-contacts', getInvalidContacts);
router.post('/invalid-contacts/:id/resolve', resolveInvalidContact);

// ==============================================
// COMMUNICATION PREFERENCES
// ==============================================
router.get('/preferences', getUserCommunicationPreferences);
router.get('/preferences/:userId', getUserCommunicationPreferences);
router.put('/preferences', updateUserCommunicationPreferences);
router.put('/preferences/:userId', updateUserCommunicationPreferences);

// ==============================================
// SMART RECIPIENT FILTERS
// ==============================================
router.get('/recipients/filters', getSmartRecipientFilters);

// ==============================================
// GLOBAL SEARCH
// ==============================================
router.get('/search', globalSearch);

// ==============================================
// COMMUNICATION USAGE & ANALYTICS
// ==============================================
router.get('/usage', getCommunicationUsage);

// ==============================================
// NOTIFICATIONS
// ==============================================

router.post('/send', sendSingleNotification);
router.post('/broadcast', sendBroadcastNotification);
router.post('/class-parents/:classId', sendClassParentNotification);
router.get('/my-notifications', getUserNotifications);
router.put('/notifications/:id/read', markNotificationAsRead);
router.get('/notifications/:id/delivery-logs', getNotificationDeliveryLogs);
router.get('/recipients/search', searchRecipients);

export default router;
