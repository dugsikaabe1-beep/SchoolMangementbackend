import asyncHandler from 'express-async-handler';
import Notification from '../models/Notification.js';
import DeliveryLog from '../models/DeliveryLog.js';
import User from '../models/User.js';
import CommunicationMessage from '../models/CommunicationMessage.js';
import CommunicationUsage from '../models/CommunicationUsage.js';
import CommunicationPreferences from '../models/CommunicationPreferences.js';
import InvalidContact from '../models/InvalidContact.js';
import NotificationTemplate from '../models/NotificationTemplate.js';
import School from '../models/School.js';
import { logAction } from '../utils/auditLogger.js';
import { sendNotification, broadcastNotification, sendToClassParents, getDeliveryLogs } from '../utils/notificationService.js';

/**
 * CRITICAL: Recipient-Based Communication Controller
 * 
 * All endpoints enforce strict recipient validation from database
 */

// ==============================================
// COMMUNICATION MESSAGES (COMPOSER, DRAFTS, SENT)
// ==============================================

export const getCommunicationMessages = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20, startDate, endDate } = req.query;
  
  const filter = {
    school: req.schoolId
  };
  
  if (status) {
    filter.status = status;
  }
  
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  
  if (req.user.role === 'branchmanager' && req.user.branch) {
    filter.branch = req.user.branch;
  }

  const messages = await CommunicationMessage.find(filter)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .populate('createdBy', 'name email')
    .populate('templateId', 'name code');

  const total = await CommunicationMessage.countDocuments(filter);

  res.json({
    success: true,
    data: {
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

export const getCommunicationMessageById = asyncHandler(async (req, res) => {
  const message = await CommunicationMessage.findOne({
    _id: req.params.id,
    school: req.schoolId
  }).populate('createdBy', 'name email')
    .populate('templateId', 'name code');

  if (!message) {
    res.status(404);
    throw new Error('Communication message not found');
  }

  res.json({ success: true, data: message });
});

export const createCommunicationMessage = asyncHandler(async (req, res) => {
  const {
    title,
    subject,
    body,
    templateId,
    recipients,
    channels,
    status = 'draft',
    sendAt,
    timezone,
    isRecurring,
    recurrenceRule,
    recurrenceEnd
  } = req.body;

  if (!title || !body) {
    res.status(400);
    throw new Error('Title and body are required');
  }

  const messageData = {
    tenantId: req.schoolId,
    school: req.schoolId,
    branch: req.user.branch,
    title,
    subject,
    body,
    templateId,
    recipients: recipients || [],
    channels: channels || ['in_app'],
    status,
    sendAt: sendAt ? new Date(sendAt) : undefined,
    timezone: timezone || 'UTC',
    isRecurring,
    recurrenceRule,
    recurrenceEnd: recurrenceEnd ? new Date(recurrenceEnd) : undefined,
    createdBy: req.user._id,
    updatedBy: req.user._id
  };

  const message = await CommunicationMessage.create(messageData);

  await logAction(req.user._id, {
    action: 'CREATE_COMMUNICATION_MESSAGE',
    module: 'COMMUNICATION',
    targetId: message._id,
    details: {
      title,
      status
    }
  });

  res.status(201).json({ success: true, data: message });
});

export const updateCommunicationMessage = asyncHandler(async (req, res) => {
  const message = await CommunicationMessage.findOne({
    _id: req.params.id,
    school: req.schoolId
  });

  if (!message) {
    res.status(404);
    throw new Error('Communication message not found');
  }

  if (['sent', 'delivered', 'cancelled', 'archived'].includes(message.status)) {
    res.status(403);
    throw new Error('Cannot modify a message that has already been sent or archived');
  }

  const {
    title,
    subject,
    body,
    templateId,
    recipients,
    channels,
    status,
    sendAt,
    timezone,
    isRecurring,
    recurrenceRule,
    recurrenceEnd
  } = req.body;

  if (title) message.title = title;
  if (subject !== undefined) message.subject = subject;
  if (body) message.body = body;
  if (templateId !== undefined) message.templateId = templateId;
  if (recipients !== undefined) message.recipients = recipients;
  if (channels !== undefined) message.channels = channels;
  if (status !== undefined) message.status = status;
  if (sendAt !== undefined) message.sendAt = sendAt ? new Date(sendAt) : undefined;
  if (timezone !== undefined) message.timezone = timezone;
  if (isRecurring !== undefined) message.isRecurring = isRecurring;
  if (recurrenceRule !== undefined) message.recurrenceRule = recurrenceRule;
  if (recurrenceEnd !== undefined) message.recurrenceEnd = recurrenceEnd ? new Date(recurrenceEnd) : undefined;
  
  message.updatedBy = req.user._id;

  const updatedMessage = await message.save();

  await logAction(req.user._id, {
    action: 'UPDATE_COMMUNICATION_MESSAGE',
    module: 'COMMUNICATION',
    targetId: updatedMessage._id,
    details: {
      title: updatedMessage.title,
      status: updatedMessage.status
    }
  });

  res.json({ success: true, data: updatedMessage });
});

export const deleteCommunicationMessage = asyncHandler(async (req, res) => {
  const message = await CommunicationMessage.findOne({
    _id: req.params.id,
    school: req.schoolId
  });

  if (!message) {
    res.status(404);
    throw new Error('Communication message not found');
  }

  if (['sent', 'delivered'].includes(message.status)) {
    await CommunicationMessage.findByIdAndUpdate(req.params.id, { status: 'archived' });
  } else {
    await CommunicationMessage.findByIdAndDelete(req.params.id);
  }

  await logAction(req.user._id, {
    action: 'DELETE_COMMUNICATION_MESSAGE',
    module: 'COMMUNICATION',
    targetId: req.params.id
  });

  res.json({ success: true, message: 'Message deleted/archived successfully' });
});

export const duplicateCommunicationMessage = asyncHandler(async (req, res) => {
  const originalMessage = await CommunicationMessage.findOne({
    _id: req.params.id,
    school: req.schoolId
  });

  if (!originalMessage) {
    res.status(404);
    throw new Error('Communication message not found');
  }

  const { title, subject, body, templateId, recipients, channels } = originalMessage;
  
  const duplicatedMessage = await CommunicationMessage.create({
    tenantId: req.schoolId,
    school: req.schoolId,
    branch: req.user.branch,
    title: `${title} (Copy)`,
    subject,
    body,
    templateId,
    recipients,
    channels,
    status: 'draft',
    createdBy: req.user._id,
    updatedBy: req.user._id
  });

  await logAction(req.user._id, {
    action: 'DUPLICATE_COMMUNICATION_MESSAGE',
    module: 'COMMUNICATION',
    targetId: duplicatedMessage._id,
    details: {
      originalId: req.params.id,
      title: duplicatedMessage.title
    }
  });

  res.status(201).json({ success: true, data: duplicatedMessage });
});

export const previewMessage = asyncHandler(async (req, res) => {
  const { title, body, variables, channels } = req.body;
  
  // Simple variable replacement function
  const replaceVariables = (text, vars) => {
    let result = text;
    if (vars) {
      Object.keys(vars).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, vars[key] || `{{${key}}}`);
      });
    }
    return result;
  };
  
  const preview = {
    inApp: {
      title: replaceVariables(title, variables),
      body: replaceVariables(body, variables)
    }
  };
  
  if (channels && channels.includes('email')) {
    preview.email = {
      subject: replaceVariables(req.body.subject || title, variables),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>${replaceVariables(title, variables)}</h1>
          <div style="line-height: 1.6;">${replaceVariables(body, variables)}</div>
        </div>
      `,
      text: replaceVariables(body, variables)
    };
  }
  
  if (channels && (channels.includes('sms') || channels.includes('whatsapp'))) {
    preview.sms = replaceVariables(body, variables);
    preview.whatsapp = replaceVariables(body, variables);
  }
  
  if (channels && channels.includes('push')) {
    preview.push = {
      title: replaceVariables(title, variables),
      body: replaceVariables(body, variables)
    };
  }
  
  res.json({ success: true, data: preview });
});

export const sendCommunicationMessage = asyncHandler(async (req, res) => {
  const message = await CommunicationMessage.findOne({
    _id: req.params.id,
    school: req.schoolId
  });

  if (!message) {
    res.status(404);
    throw new Error('Communication message not found');
  }

  if (!['draft', 'scheduled', 'queued'].includes(message.status)) {
    res.status(400);
    throw new Error('Message has already been sent');
  }

  // Resolve recipients
  const resolvedRecipientIds = [];
  
  for (const recipient of message.recipients) {
    if (recipient.kind === 'user') {
      const user = await User.findOne({ _id: recipient.id, school: req.schoolId });
      if (user && user.status === 'active' && !user.isDeleted) {
        resolvedRecipientIds.push(user._id.toString());
      }
    } else if (recipient.kind === 'class') {
      const students = await User.find({
        class: recipient.id,
        school: req.schoolId,
        role: 'student',
        status: 'active',
        isDeleted: false
      });
      resolvedRecipientIds.push(...students.map(s => s._id.toString()));
      
      // Also add parents linked to these students
      for (const student of students) {
        const parents = await User.find({
          school: req.schoolId,
          role: 'parent',
          linkedStudents: student._id,
          status: 'active',
          isDeleted: false
        });
        resolvedRecipientIds.push(...parents.map(p => p._id.toString()));
      }
    } else if (recipient.kind === 'branch') {
      const users = await User.find({
        branch: recipient.id,
        school: req.schoolId,
        status: 'active',
        isDeleted: false
      });
      resolvedRecipientIds.push(...users.map(u => u._id.toString()));
    } else if (recipient.kind === 'school') {
      const users = await User.find({
        school: req.schoolId,
        status: 'active',
        isDeleted: false
      });
      resolvedRecipientIds.push(...users.map(u => u._id.toString()));
    }
  }

  const uniqueRecipientIds = [...new Set(resolvedRecipientIds)];

  if (uniqueRecipientIds.length === 0) {
    res.status(400);
    throw new Error('No valid recipients found');
  }

  const result = await broadcastNotification({
    recipientIds: uniqueRecipientIds,
    schoolId: req.schoolId,
    branchId: req.user.branch,
    title: message.title,
    message: message.body,
    type: 'announcement',
    channels: message.channels,
    createdBy: req.user._id
  });

  message.status = 'sent';
  message.sentAt = new Date();
  message.deliverySummary.totalRecipients = uniqueRecipientIds.length;
  await message.save();

  await logAction(req.user._id, {
    action: 'SEND_COMMUNICATION_MESSAGE',
    module: 'COMMUNICATION',
    targetId: message._id,
    details: {
      title: message.title,
      recipientCount: uniqueRecipientIds.length
    }
  });

  res.json({
    success: true,
    data: {
      message,
      result
    }
  });
});

// ==============================================
// COMMUNICATION USAGE & ANALYTICS
// ==============================================

export const getCommunicationUsage = asyncHandler(async (req, res) => {
  const { startDate, endDate, period = 'monthly' } = req.query;
  
  const dateFilter = { school: req.schoolId, period };
  
  if (startDate) dateFilter.date = { $gte: new Date(startDate) };
  if (endDate) dateFilter.date = { ...dateFilter.date, $lte: new Date(endDate) };
  
  const usageRecords = await CommunicationUsage.find(dateFilter).sort({ date: 1 });
  
  // Calculate totals
  const totals = {
    sms: { sent: 0, delivered: 0, failed: 0, cost: 0 },
    whatsapp: { sent: 0, delivered: 0, failed: 0, cost: 0 },
    email: { sent: 0, delivered: 0, opened: 0, failed: 0, cost: 0 },
    push: { sent: 0, delivered: 0, opened: 0, failed: 0, cost: 0 },
    totalMessages: 0,
    totalCost: 0
  };
  
  for (const record of usageRecords) {
    totals.sms.sent += record.sms.sent;
    totals.sms.delivered += record.sms.delivered;
    totals.sms.failed += record.sms.failed;
    totals.sms.cost += record.sms.cost;
    
    totals.whatsapp.sent += record.whatsapp.sent;
    totals.whatsapp.delivered += record.whatsapp.delivered;
    totals.whatsapp.failed += record.whatsapp.failed;
    totals.whatsapp.cost += record.whatsapp.cost;
    
    totals.email.sent += record.email.sent;
    totals.email.delivered += record.email.delivered;
    totals.email.opened += record.email.opened;
    totals.email.failed += record.email.failed;
    totals.email.cost += record.email.cost;
    
    totals.push.sent += record.push.sent;
    totals.push.delivered += record.push.delivered;
    totals.push.opened += record.push.opened;
    totals.push.failed += record.push.failed;
    totals.push.cost += record.push.cost;
    
    totals.totalMessages += record.totalMessages;
    totals.totalCost += record.totalCost;
  }

  res.json({
    success: true,
    data: {
      totals,
      usageRecords
    }
  });
});

// ==============================================
// EXISTING NOTIFICATION FUNCTIONS
// ==============================================

/**
 * Send notification to single recipient
 */
export const sendSingleNotification = asyncHandler(async (req, res) => {
  const { recipientId, title, message, type, priority, actionLink, channels, templateCode, language } = req.body;
  
  if (!recipientId || !title || !message) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields'
    });
  }

  const result = await sendNotification({
    recipientId,
    schoolId: req.schoolId,
    branchId: req.branchId,
    title,
    message,
    type: type || 'info',
    priority: priority || 'normal',
    actionLink,
    channels: channels || ['in_app'],
    templateCode,
    language: language || 'en',
    createdBy: req.user._id
  });

  if (!result) {
    return res.status(500).json({
      success: false,
      message: 'Failed to send notification'
    });
  }

  res.status(200).json({
    success: true,
    data: result
  });
});

/**
 * Send broadcast notification to multiple recipients
 */
export const sendBroadcastNotification = asyncHandler(async (req, res) => {
  const { recipientIds, title, message, type, priority, channels, templateCode, language } = req.body;
  
  if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Valid recipientIds array required'
    });
  }

  if (!title || !message) {
    return res.status(400).json({
      success: false,
      message: 'Missing title or message'
    });
  }

  const result = await broadcastNotification({
    recipientIds,
    schoolId: req.schoolId,
    branchId: req.branchId,
    title,
    message,
    type: type || 'announcement',
    priority: priority || 'normal',
    channels: channels || ['in_app'],
    templateCode,
    language: language || 'en',
    createdBy: req.user._id
  });

  res.status(200).json({
    success: true,
    data: result
  });
});

/**
 * Send notification to all parents in a class
 */
export const sendClassParentNotification = asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { title, message, type, channels } = req.body;

  if (!classId || !title || !message) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields'
    });
  }

  const result = await sendToClassParents({
    classId,
    schoolId: req.schoolId,
    branchId: req.branchId,
    title,
    message,
    type: type || 'announcement',
    channels: channels || ['in_app', 'sms', 'email'],
    createdBy: req.user._id
  });

  res.status(200).json({
    success: true,
    data: result
  });
});

/**
 * Get notifications for current user
 */
export const getUserNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const query = {
    recipient: req.user._id,
    school: req.schoolId
  };

  if (status) {
    query.status = status;
  }

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .lean();

  const total = await Notification.countDocuments(query);

  res.status(200).json({
    success: true,
    data: {
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * Mark notification as read
 */
export const markNotificationAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient: req.user._id, school: req.schoolId },
    {
      $addToSet: {
        readBy: {
          userId: req.user._id,
          readAt: new Date()
        }
      }
    },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: 'Notification not found'
    });
  }

  res.status(200).json({
    success: true,
    data: notification
  });
});

/**
 * Get delivery logs for a notification
 */
export const getNotificationDeliveryLogs = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const logs = await getDeliveryLogs(id, req.schoolId);

  res.status(200).json({
    success: true,
    data: logs
  });
});

/**
 * Search recipients for communication
 */
export const searchRecipients = asyncHandler(async (req, res) => {
  const { query, role, branchId } = req.query;
  
  const filter = {
    school: req.schoolId,
    isDeleted: false,
    status: 'active'
  };

  if (role) {
    filter.role = role;
  }

  if (branchId && req.user.role === 'branchmanager') {
    filter.branch = branchId;
  }

  if (query) {
    filter.$or = [
      { name: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } },
      { phone: { $regex: query, $options: 'i' } }
    ];
  }

  const users = await User.find(filter)
    .select('name email phone role branch class')
    .sort({ name: 1 })
    .limit(50)
    .lean();

  res.status(200).json({
    success: true,
    data: users
  });
});

// ==============================================
// COMMUNICATION HEALTH DASHBOARD
// ==============================================
export const getCommunicationHealth = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  
  const school = await School.findById(schoolId).select('communicationSettings');
  
  const health = {
    sms: {
      provider: school?.communicationSettings?.sms?.provider || 'none',
      isEnabled: school?.communicationSettings?.sms?.isEnabled || false,
      status: 'unknown',
      lastCheck: new Date()
    },
    whatsapp: {
      provider: school?.communicationSettings?.whatsapp?.provider || 'none',
      isEnabled: school?.communicationSettings?.whatsapp?.isEnabled || false,
      status: 'unknown',
      lastCheck: new Date()
    },
    email: {
      provider: school?.communicationSettings?.email?.host ? 'smtp' : 'default',
      isEnabled: school?.communicationSettings?.email?.isEnabled || false,
      status: 'unknown',
      lastCheck: new Date()
    },
    push: {
      provider: school?.communicationSettings?.push?.provider || 'none',
      isEnabled: school?.communicationSettings?.push?.isEnabled || false,
      status: 'unknown',
      lastCheck: new Date()
    },
    queue: {
      pending: 0,
      retrying: 0,
      lastProcessed: null
    },
    statistics: {
      totalMessages: 0,
      sent: 0,
      delivered: 0,
      opened: 0,
      failed: 0,
      successRate: 0
    }
  };
  
  const stats = await DeliveryLog.aggregate([
    { $match: { school: schoolId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  stats.forEach(s => {
    if (s._id === 'sent') health.statistics.sent = s.count;
    if (s._id === 'delivered') health.statistics.delivered = s.count;
    if (s._id === 'opened') health.statistics.opened = s.count;
    if (s._id === 'failed' || s._id === 'bounced') health.statistics.failed = s.count;
  });
  
  health.statistics.totalMessages = health.statistics.sent + health.statistics.delivered + health.statistics.opened + health.statistics.failed;
  health.statistics.successRate = health.statistics.totalMessages > 0 ? 
    Math.round(((health.statistics.sent + health.statistics.delivered) / health.statistics.totalMessages) * 100) : 0;
  
  const pendingCount = await CommunicationMessage.countDocuments({
    school: schoolId,
    status: { $in: ['queued', 'sending'] }
  });
  health.queue.pending = pendingCount;
  
  const retryingCount = await DeliveryLog.countDocuments({
    school: schoolId,
    status: 'queued',
    attempt: { $gt: 0 }
  });
  health.queue.retrying = retryingCount;
  
  const lastProcessed = await DeliveryLog.findOne({ school: schoolId, status: { $in: ['sent', 'delivered', 'opened'] } })
    .sort({ createdAt: -1 });
  if (lastProcessed) health.queue.lastProcessed = lastProcessed.createdAt;
  
  res.json({ success: true, data: health });
});

// ==============================================
// DELIVERY REPORT CENTER
// ==============================================
export const getDeliveryReports = asyncHandler(async (req, res) => {
  const {
    status,
    channel,
    startDate,
    endDate,
    branchId,
    classId,
    studentId,
    parentId,
    teacherId,
    page = 1,
    limit = 20
  } = req.query;
  
  const filter = {
    school: req.schoolId
  };
  
  if (status) filter.status = status;
  if (channel) filter.channel = channel;
  if (branchId) filter.branch = branchId;
  
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  
  const [logs, total] = await Promise.all([
    DeliveryLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('to.userId', 'name email phone role')
      .lean(),
    DeliveryLog.countDocuments(filter)
  ]);
  
  res.json({
    success: true,
    data: {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

// ==============================================
// INVALID CONTACTS MANAGEMENT
// ==============================================
export const getInvalidContacts = asyncHandler(async (req, res) => {
  const { contactType, isResolved, page = 1, limit = 20 } = req.query;
  
  const filter = {
    school: req.schoolId
  };
  
  if (contactType) filter.contactType = contactType;
  if (isResolved !== undefined) filter.isResolved = isResolved === 'true';
  
  const [contacts, total] = await Promise.all([
    InvalidContact.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('user', 'name email phone role')
      .lean(),
    InvalidContact.countDocuments(filter)
  ]);
  
  res.json({
    success: true,
    data: {
      contacts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

export const resolveInvalidContact = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  
  const invalidContact = await InvalidContact.findOne({
    _id: id,
    school: req.schoolId,
    isResolved: false
  });
  
  if (!invalidContact) {
    res.status(404);
    throw new Error('Invalid contact not found');
  }
  
  invalidContact.isResolved = true;
  invalidContact.resolvedAt = new Date();
  invalidContact.resolvedBy = req.user._id;
  if (notes) invalidContact.resolutionNotes = notes;
  
  await invalidContact.save();
  
  await logAction(req.user._id, {
    action: 'RESOLVE_INVALID_CONTACT',
    module: 'COMMUNICATION',
    targetId: id,
    details: {
      contactType: invalidContact.contactType,
      contactValue: invalidContact.contactValue
    }
  });
  
  res.json({ success: true, data: invalidContact });
});

// ==============================================
// COMMUNICATION PREFERENCES
// ==============================================
export const getUserCommunicationPreferences = asyncHandler(async (req, res) => {
  let userId = req.user._id;
  if (req.params.userId && ['schooladmin', 'superadmin'].includes(req.user.role)) {
    userId = req.params.userId;
  }
  
  let prefs = await CommunicationPreferences.findOne({
    user: userId,
    school: req.schoolId
  });
  
  if (!prefs) {
    prefs = await CommunicationPreferences.create({
      user: userId,
      school: req.schoolId
    });
  }
  
  res.json({ success: true, data: prefs });
});

export const updateUserCommunicationPreferences = asyncHandler(async (req, res) => {
  let userId = req.user._id;
  if (req.params.userId && ['schooladmin', 'superadmin'].includes(req.user.role)) {
    userId = req.params.userId;
  }
  
  let prefs = await CommunicationPreferences.findOne({
    user: userId,
    school: req.schoolId
  });
  
  if (!prefs) {
    prefs = new CommunicationPreferences({
      user: userId,
      school: req.schoolId
    });
  }
  
  Object.assign(prefs, req.body);
  await prefs.save();
  
  res.json({ success: true, data: prefs });
});

// ==============================================
// SMART RECIPIENT FILTERS
// ==============================================
export const getSmartRecipientFilters = asyncHandler(async (req, res) => {
  const {
    classes,
    sections,
    branches,
    gender,
    status,
    role,
    hasFeeBalance,
    lowAttendance,
    missingExams
  } = req.query;
  
  const filter = {
    school: req.schoolId,
    isDeleted: false,
    status: 'active'
  };
  
  if (role) filter.role = role;
  if (classes) filter.class = { $in: Array.isArray(classes) ? classes : [classes] };
  if (branches) filter.branch = { $in: Array.isArray(branches) ? branches : [branches] };
  if (gender) filter.gender = gender;
  if (status) filter.status = status;
  
  const users = await User.find(filter)
    .select('name email phone role branch class gender status')
    .sort({ name: 1 })
    .lean();
  
  res.json({ success: true, data: users });
});

// ==============================================
// GLOBAL COMMUNICATION SEARCH
// ==============================================
export const globalSearch = asyncHandler(async (req, res) => {
  const { q, type, page = 1, limit = 20 } = req.query;
  const schoolId = req.schoolId;
  
  if (!q || q.length < 2) {
    return res.json({ success: true, data: { messages: [], logs: [], recipients: [] } });
  }
  
  const [messages, logs, recipients] = await Promise.all([
    CommunicationMessage.find({
      school: schoolId,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { subject: { $regex: q, $options: 'i' } },
        { body: { $regex: q, $options: 'i' } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    DeliveryLog.find({
      school: schoolId,
      $or: [
        { 'to.name': { $regex: q, $options: 'i' } },
        { 'to.email': { $regex: q, $options: 'i' } },
        { 'to.phone': { $regex: q, $options: 'i' } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    User.find({
      school: schoolId,
      isDeleted: false,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } }
      ]
    })
      .select('name email phone role')
      .sort({ name: 1 })
      .limit(20)
      .lean()
  ]);
  
  res.json({
    success: true,
    data: {
      messages,
      logs,
      recipients
    }
  });
});

export default {
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
};
