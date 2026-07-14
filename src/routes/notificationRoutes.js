import express from 'express';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import {
  getMyNotifications,
  getNotificationHistory,
  getRecipients,
  createNotification,
  testNotification,
  getUnreadCount,
  markAllRead,
  markRead,
  archiveNotification,
  registerFcmToken,
  removeFcmToken,
  registerOneSignalPlayerId,
  removeOneSignalPlayerId,
} from '../controllers/notificationController.js';

const router = express.Router();

router.use(asyncHandler(protect));

const adminRoles = ['schooladmin', 'school_admin', 'admin', 'branchmanager', 'branch_manager'];

const requireNotificationManager = [
  checkPermission(['settings.manage', 'settings.view']),
  (req, res, next) => {
    if (adminRoles.includes(req.user?.role)) return next();
    return res.status(403).json({
      success: false,
      message: 'Permission denied',
      userMessage: 'You do not have permission to manage notifications.',
    });
  },
];

router.get('/', getMyNotifications);
router.get('/history', requireNotificationManager, getNotificationHistory);
router.get('/recipients', requireNotificationManager, getRecipients);
router.get('/unread-count', getUnreadCount);
router.put('/mark-all-read', markAllRead);

router.post('/', requireNotificationManager, createNotification);
router.post('/test', requireNotificationManager, testNotification);

router.put('/:id/read', markRead);
router.delete('/:id', archiveNotification);

router.post('/fcm-tokens', registerFcmToken);
router.delete('/fcm-tokens', removeFcmToken);
router.post('/onesignal-player-ids', registerOneSignalPlayerId);
router.delete('/onesignal-player-ids', removeOneSignalPlayerId);

export default router;
