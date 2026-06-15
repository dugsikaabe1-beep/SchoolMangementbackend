import express from 'express';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';
import { broadcastNotification, sendNotification } from '../utils/notificationService.js';

const router = express.Router();

router.use(protect);

const adminRoles = ['schooladmin', 'school_admin', 'admin', 'branchmanager', 'branch_manager'];

const getSchoolId = (req) => req.schoolId || req.user?.school?._id || req.user?.school;
const getBranchId = (req) => req.branchId || req.user?.branch?._id || req.user?.branch || null;

const normalizeChannels = (channels = []) => {
  const allowed = ['in_app', 'email', 'sms', 'whatsapp', 'push'];
  const normalized = channels.filter((channel) => allowed.includes(channel));
  return normalized.length ? [...new Set(normalized)] : ['in_app'];
};

const buildRecipientQuery = (req, audience, recipientIds = []) => {
  const query = {
    school: getSchoolId(req),
    isDeleted: { $ne: true },
  };

  if (req.user?.branchScope !== 'ALL_BRANCHES' && getBranchId(req)) {
    query.branch = getBranchId(req);
  } else if (req.headers['x-branch-id'] && req.headers['x-branch-id'] !== 'all') {
    query.branch = req.headers['x-branch-id'];
  }

  if (audience === 'selected') {
    query._id = { $in: recipientIds };
  } else if (audience && audience !== 'all') {
    query.role = audience;
  }

  return query;
};

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

/**
 * Get all notifications for current user
 */
router.get('/', async (req, res) => {
  try {
    const notifications = await Notification.find({ 
      recipient: req.user._id,
      status: { $ne: 'archived' }
    }).sort({ createdAt: -1 }).limit(50);

    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Notification history for school admins.
 */
router.get('/history', requireNotificationManager, async (req, res) => {
  try {
    const query = {
      school: getSchoolId(req),
      status: { $ne: 'archived' },
    };

    if (req.user?.branchScope !== 'ALL_BRANCHES' && getBranchId(req)) {
      query.branch = getBranchId(req);
    }

    const notifications = await Notification.find(query)
      .populate('recipient', 'name role email phone customId')
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Recipient list for composing notifications.
 */
router.get('/recipients', requireNotificationManager, async (req, res) => {
  try {
    const query = buildRecipientQuery(req, req.query.role || 'all');
    const recipients = await User.find(query)
      .select('name role email phone customId branch')
      .sort({ role: 1, name: 1 })
      .limit(500);

    res.json({ success: true, data: recipients });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Create and send a notification to one or more users.
 */
router.post('/', requireNotificationManager, async (req, res) => {
  try {
    const {
      title,
      message,
      type = 'info',
      priority = 'normal',
      actionLink = '',
      audience = 'all',
      recipientIds = [],
      channels = ['in_app'],
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required',
        userMessage: 'Please enter a title and message.',
      });
    }

    const selectedChannels = normalizeChannels(channels);
    const recipients = await User.find(buildRecipientQuery(req, audience, recipientIds))
      .select('name email phone metadata branch')
      .limit(1000);

    if (!recipients.length) {
      return res.status(400).json({
        success: false,
        message: 'No recipients found',
        userMessage: 'No matching recipients were found for this notification.',
      });
    }

    const schoolId = getSchoolId(req);
    const fallbackBranchId = getBranchId(req);
    const shouldBroadcastInApp = selectedChannels.length === 1 && selectedChannels[0] === 'in_app' && recipients.length > 1;

    let sent = [];
    if (shouldBroadcastInApp) {
      sent = await broadcastNotification({
        recipientIds: recipients.map((recipient) => recipient._id),
        schoolId,
        branchId: fallbackBranchId,
        title,
        message,
        type,
        priority,
        channels: selectedChannels,
        actionLink,
      }) || [];
    } else {
      sent = await Promise.all(recipients.map((recipient) => sendNotification({
        recipientId: recipient._id,
        schoolId,
        branchId: recipient.branch || fallbackBranchId,
        title,
        message,
        type,
        priority,
        actionLink,
        metadata: { createdBy: req.user._id, audience },
        emailData: selectedChannels.includes('email') && recipient.email ? {
          to: recipient.email,
          subject: title,
          html: `<p>${message}</p>`,
        } : null,
        smsData: selectedChannels.includes('sms') && recipient.phone ? {
          to: recipient.phone,
          body: message,
        } : null,
        whatsappData: selectedChannels.includes('whatsapp') && recipient.phone ? {
          to: recipient.phone,
          body: message,
        } : null,
        pushData: selectedChannels.includes('push') ? {
          token: recipient.metadata?.pushToken || recipient.metadata?.expoPushToken,
          data: { title, message, actionLink },
        } : null,
      })));
    }

    res.status(201).json({
      success: true,
      data: {
        requested: recipients.length,
        sent: sent.filter(Boolean).length,
        channels: selectedChannels,
      },
      message: 'Notification sent',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get unread count
 */
router.get('/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      status: 'unread'
    });
    res.json({ success: true, data: count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Mark all notifications as read
 */
router.put('/mark-all-read', async (req, res) => {
  try {
    const query = adminRoles.includes(req.user?.role)
      ? { school: getSchoolId(req), status: 'unread' }
      : { recipient: req.user._id, status: 'unread' };

    if (adminRoles.includes(req.user?.role) && req.user?.branchScope !== 'ALL_BRANCHES' && getBranchId(req)) {
      query.branch = getBranchId(req);
    }

    await Notification.updateMany(query, { status: 'read' });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Mark notification as read
 */
router.put('/:id/read', async (req, res) => {
  try {
    const query = adminRoles.includes(req.user?.role)
      ? { _id: req.params.id, school: getSchoolId(req) }
      : { _id: req.params.id, recipient: req.user._id };

    await Notification.findOneAndUpdate(
      query,
      { status: 'read' }
    );
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Archive/Delete notification
 */
router.delete('/:id', async (req, res) => {
  try {
    const query = adminRoles.includes(req.user?.role)
      ? { _id: req.params.id, school: getSchoolId(req) }
      : { _id: req.params.id, recipient: req.user._id };

    await Notification.findOneAndUpdate(
      query,
      { status: 'archived' }
    );
    res.json({ success: true, message: 'Notification archived' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
