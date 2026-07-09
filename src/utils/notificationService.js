import Notification from '../models/Notification.js';
import School from '../models/School.js';
import User from '../models/User.js';
import ChannelProvider from '../models/ChannelProvider.js';
import DeliveryLog from '../models/DeliveryLog.js';
import nodemailer from 'nodemailer';
import { emitToUser, emitToSchool } from './socket.js';
import fcmProvider from '../services/providers/fcmProvider.js';
import oneSignalProvider from '../services/providers/oneSignalProvider.js';
import smsProvider from '../services/providers/smsProvider.js';

/**
 * CRITICAL: Recipient-Based Communication Service
 * 
 * RULES:
 * - All communication uses ONLY contact info from database records
 * - No manual recipient entry allowed
 * - Strict tenant/branch isolation
 * - Recipient validation before sending
 */

/**
 * Resolve recipient contact details from database
 */
async function resolveRecipient(recipientId, schoolId) {
  const user = await User.findById(recipientId)
    .select('name email phone linkedStudents school branch role status isDeleted fcmTokens oneSignalPlayerIds')
    .lean();

  if (!user) {
    throw new Error(`Recipient not found: ${recipientId}`);
  }

  // Validate tenant isolation
  if (String(user.school) !== String(schoolId)) {
    throw new Error(`Recipient ${recipientId} does not belong to school ${schoolId}`);
  }

  // Validate user status
  if (user.isDeleted || user.status !== 'active') {
    throw new Error(`Recipient ${recipientId} is not active`);
  }

  return {
    userId: user._id,
    name: user.name,
    role: user.role,
    email: user.email,
    phone: user.phone,
    schoolId: user.school,
    branchId: user.branch,
    fcmTokens: user.fcmTokens,
    oneSignalPlayerIds: user.oneSignalPlayerIds
  };
}

/**
 * Validate and resolve multiple recipients
 */
async function resolveRecipients(recipientIds, schoolId) {
  const recipients = [];
  const errors = [];

  for (const id of recipientIds) {
    try {
      const recipient = await resolveRecipient(id, schoolId);
      recipients.push(recipient);
    } catch (error) {
      errors.push({ recipientId: id, error: error.message });
    }
  }

  return { recipients, errors };
}

/**
 * Get tenant-specific communication settings
 */
async function getTenantCommunicationSettings(schoolId) {
  const school = await School.findById(schoolId)
    .select('communicationSettings')
    .lean();

  return school?.communicationSettings || {};
}

/**
 * Get active channel providers for a tenant
 */
async function getTenantChannelProviders(schoolId) {
  return await ChannelProvider.find({
    school: schoolId,
    isActive: true
  }).lean();
}

/**
 * Create email transporter from tenant settings
 */
async function createTenantEmailTransporter(schoolId) {
  const settings = await getTenantCommunicationSettings(schoolId);
  
  if (!settings.email?.host) {
    // Fallback to global settings if tenant settings not configured
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  return nodemailer.createTransport({
    host: settings.email.host,
    port: settings.email.port,
    secure: settings.email.secure,
    auth: {
      user: settings.email.username,
      pass: settings.email.password,
    },
  });
}

/**
 * Send notification to a single recipient (recipient-based only)
 * CRITICAL: Never allows manual recipient entry
 */
export const sendNotification = async ({
  recipientId, 
  schoolId, 
  branchId, 
  title, 
  message, 
  type = 'info', 
  priority = 'normal',
  actionLink = null, 
  metadata = {},
  channels = ['in_app'], // Can include: in_app, email, sms, whatsapp, push
  templateCode = null,
  language = 'en',
  createdBy = null
}) => {
  try {
    console.log(`[NotificationService] Processing notification for recipient ${recipientId}`);

    // STEP 1: Resolve recipient from database (CRITICAL - NO MANUAL ENTRY)
    const recipient = await resolveRecipient(recipientId, schoolId);
    console.log(`[NotificationService] Resolved recipient: ${recipient.name} (${recipient.role})`);

    // STEP 2: Validate branch isolation
    if (branchId && recipient.branchId && String(branchId) !== String(recipient.branchId)) {
      throw new Error(`Recipient ${recipientId} does not belong to branch ${branchId}`);
    }

    const usedChannels = ['in_app'];
    const deliveryLogs = [];

    // STEP 3: Create the notification record
    const notification = await Notification.create({
      recipient: recipientId,
      recipients: [{ kind: 'user', id: recipientId }],
      tenantId: schoolId,
      school: schoolId,
      branch: branchId || recipient.branchId,
      title,
      message,
      messageType: type,
      priority,
      actionLink,
      metadata,
      templateCode,
      language,
      createdBy,
      channels: usedChannels,
      status: 'processing',
      deliverySummary: {
        total: channels.length,
        sent: 0,
        delivered: 0,
        opened: 0,
        failed: 0
      }
    });

    // STEP 4: In-App Notification (always included)
    console.log(`[NotificationService] Sending in-app notification to ${recipient.name}`);
    emitToUser(String(recipientId), 'notification', {
      _id: notification._id,
      title,
      message,
      type,
      createdAt: notification.createdAt,
      actionLink
    });

    // STEP 5: Email (if requested and recipient has email)
    if (channels.includes('email') && recipient.email) {
      try {
        const transporter = await createTenantEmailTransporter(schoolId);
        const settings = await getTenantCommunicationSettings(schoolId);
        const senderName = settings.email?.senderName || 'School Management System';
        const senderEmail = settings.email?.senderAddress || process.env.EMAIL_FROM;

        const info = await transporter.sendMail({
          from: `"${senderName}" <${senderEmail}>`,
          to: recipient.email,
          subject: title,
          html: `<h3>${title}</h3><p>${message}</p>${actionLink ? `<p><a href="${actionLink}">View Details</a></p>` : ''}`
        });

        usedChannels.push('email');
        console.log(`[NotificationService] Email sent to ${recipient.email}`);

        // Record delivery log with full recipient context
        const emailLog = await DeliveryLog.create({
          notificationId: notification._id,
          tenantId: schoolId,
          school: schoolId,
          branch: branchId || recipient.branchId,
          channel: 'email',
          provider: 'nodemailer',
          providerMessageId: info.messageId,
          to: {
            userId: recipient.userId,
            email: recipient.email,
            name: recipient.name,
            role: recipient.role
          },
          status: 'sent',
          sentAt: new Date()
        });
        deliveryLogs.push(emailLog);
        notification.deliverySummary.sent++;
      } catch (emailError) {
        console.error('[NotificationService] Email delivery failed:', emailError.message);
        notification.deliverySummary.failed++;
        
        // Log failed attempt
        await DeliveryLog.create({
          notificationId: notification._id,
          tenantId: schoolId,
          school: schoolId,
          branch: branchId || recipient.branchId,
          channel: 'email',
          provider: 'nodemailer',
          to: {
            userId: recipient.userId,
            email: recipient.email,
            name: recipient.name,
            role: recipient.role
          },
          status: 'failed',
          failedAt: new Date(),
          lastError: emailError.message
        });
      }
    }

    // STEP 6: FCM Push Notifications (if requested)
    if (channels.includes('push') && recipient.fcmTokens?.length > 0) {
      const activeFcmTokens = recipient.fcmTokens.filter(t => t.active);
      for (const tokenData of activeFcmTokens) {
        try {
          const result = await fcmProvider.sendPush({
            token: tokenData.token,
            title,
            body: message,
            data: {
              notificationId: String(notification._id),
              actionLink
            }
          });

          usedChannels.push('push');
          console.log(`[NotificationService] FCM push sent to ${recipient.name}`);

          const pushLog = await DeliveryLog.create({
            notificationId: notification._id,
            tenantId: schoolId,
            school: schoolId,
            branch: branchId || recipient.branchId,
            channel: 'push',
            provider: 'fcm',
            to: {
              userId: recipient.userId,
              name: recipient.name,
              role: recipient.role,
              token: tokenData.token
            },
            providerMessageId: result.providerMessageId,
            status: result.status,
            sentAt: new Date(),
            response: result.response
          });
          deliveryLogs.push(pushLog);
          notification.deliverySummary.sent++;
        } catch (pushError) {
          console.error('[NotificationService] FCM push delivery failed:', pushError.message);
          notification.deliverySummary.failed++;
          
          await DeliveryLog.create({
            notificationId: notification._id,
            tenantId: schoolId,
            school: schoolId,
            branch: branchId || recipient.branchId,
            channel: 'push',
            provider: 'fcm',
            to: {
              userId: recipient.userId,
              name: recipient.name,
              role: recipient.role
            },
            status: 'failed',
            failedAt: new Date(),
            lastError: pushError.message
          });
        }
      }
    }

    // STEP 7: OneSignal Web Push Notifications (if requested)
    if (channels.includes('push') && recipient.oneSignalPlayerIds?.length > 0) {
      const activePlayerIds = recipient.oneSignalPlayerIds.filter(t => t.active);
      const channelProviders = await getTenantChannelProviders(schoolId);
      const oneSignalConfig = channelProviders.find(p => p.providerKey === 'onesignal_push')?.config || {};
      
      for (const playerData of activePlayerIds) {
        try {
          const result = await oneSignalProvider.sendWebPush({
            playerId: playerData.playerId,
            title,
            body: message,
            data: {
              notificationId: String(notification._id),
              actionLink
            },
            config: oneSignalConfig
          });

          usedChannels.push('push');
          console.log(`[NotificationService] OneSignal push sent to ${recipient.name}`);

          const pushLog = await DeliveryLog.create({
            notificationId: notification._id,
            tenantId: schoolId,
            school: schoolId,
            branch: branchId || recipient.branchId,
            channel: 'push',
            provider: 'onesignal',
            to: {
              userId: recipient.userId,
              name: recipient.name,
              role: recipient.role,
              playerId: playerData.playerId
            },
            providerMessageId: result.providerMessageId,
            status: result.status,
            sentAt: new Date(),
            response: result.response
          });
          deliveryLogs.push(pushLog);
          notification.deliverySummary.sent++;
        } catch (pushError) {
          console.error('[NotificationService] OneSignal push delivery failed:', pushError.message);
          notification.deliverySummary.failed++;
          
          await DeliveryLog.create({
            notificationId: notification._id,
            tenantId: schoolId,
            school: schoolId,
            branch: branchId || recipient.branchId,
            channel: 'push',
            provider: 'onesignal',
            to: {
              userId: recipient.userId,
              name: recipient.name,
              role: recipient.role
            },
            status: 'failed',
            failedAt: new Date(),
            lastError: pushError.message
          });
        }
      }
    }

    // STEP 8: SMS Notifications (if requested)
    if (channels.includes('sms') && recipient.phone) {
      try {
        const channelProviders = await getTenantChannelProviders(schoolId);
        const smsProviderData = channelProviders.find(p => p.providerType === 'sms') || {};
        const smsConfig = smsProviderData.config || {};
        const providerName = smsProviderData.providerKey?.replace('_sms', '') || 'generic';
        
        const result = await smsProvider.sendSms({
          to: recipient.phone,
          message,
          provider: providerName,
          config: smsConfig
        });

        usedChannels.push('sms');
        console.log(`[NotificationService] SMS sent to ${recipient.name} (${recipient.phone})`);

        const smsLog = await DeliveryLog.create({
          notificationId: notification._id,
          tenantId: schoolId,
          school: schoolId,
          branch: branchId || recipient.branchId,
          channel: 'sms',
          provider: providerName,
          to: {
            userId: recipient.userId,
            phone: recipient.phone,
            name: recipient.name,
            role: recipient.role
          },
          providerMessageId: result.providerMessageId,
          status: result.status,
          sentAt: new Date(),
          response: result.response
        });
        deliveryLogs.push(smsLog);
        notification.deliverySummary.sent++;
      } catch (smsError) {
        console.error('[NotificationService] SMS delivery failed:', smsError.message);
        notification.deliverySummary.failed++;
        
        await DeliveryLog.create({
          notificationId: notification._id,
          tenantId: schoolId,
          school: schoolId,
          branch: branchId || recipient.branchId,
          channel: 'sms',
          to: {
            userId: recipient.userId,
            phone: recipient.phone,
            name: recipient.name,
            role: recipient.role
          },
          status: 'failed',
          failedAt: new Date(),
          lastError: smsError.message
        });
      }
    }

    // Update notification with final status
    notification.channels = usedChannels;
    notification.status = 'completed';
    await notification.save();

    return {
      notification,
      deliveryLogs,
      recipient
    };
  } catch (error) {
    console.error('[NotificationService] Critical error:', error.message);
    return null;
  }
};

/**
 * Send Payment Receipt Notification
 * @param {string} transactionId Transaction ID
 * @param {string} studentId Student ID
 * @param {string} schoolId School ID
 */
export const sendPaymentReceipt = async (transactionId, studentId, schoolId) => {
  try {
    const User = (await import('../models/User.js')).default;
    const student = await User.findById(studentId).populate('parent');
    if (!student) return;

    // Send push notification if implemented in this file
    // Assumes sendNotification is available
    await sendNotification({
      recipientId: studentId,
      schoolId: schoolId,
      branchId: student.branch,
      title: 'Payment Receipt',
      message: `We have received your payment for ${student.name}. Thank you!`,
      type: 'payment',
      priority: 'high',
      channels: ['in_app', 'push', 'email']
    });

  } catch (error) {
    console.error('Error sending payment receipt notification:', error);
  }
};

/**
 * Send broadcast notification to multiple recipients (recipient-based only)
 */
export const broadcastNotification = async ({ 
  recipientIds, 
  schoolId, 
  branchId, 
  title, 
  message, 
  type = 'announcement',
  priority = 'normal',
  channels = ['in_app'],
  templateCode = null,
  language = 'en',
  createdBy = null
}) => {
  try {
    console.log(`[NotificationService] Processing broadcast to ${recipientIds.length} recipients`);

    // STEP 1: Resolve ALL recipients (CRITICAL - NO MANUAL ENTRY)
    const { recipients: validRecipients, errors: resolutionErrors } = await resolveRecipients(recipientIds, schoolId);
    
    if (validRecipients.length === 0) {
      console.error('[NotificationService] No valid recipients found');
      return { success: false, errors: resolutionErrors };
    }

    console.log(`[NotificationService] Resolved ${validRecipients.length} valid recipients`);

    // STEP 2: Create master broadcast notification
    const notification = await Notification.create({
      recipients: validRecipients.map(r => ({ kind: 'user', id: r.userId })),
      tenantId: schoolId,
      school: schoolId,
      branch: branchId,
      title,
      message,
      messageType: type,
      priority,
      channels,
      templateCode,
      language,
      createdBy,
      status: 'processing',
      deliverySummary: {
        total: validRecipients.length * channels.length,
        sent: 0,
        delivered: 0,
        opened: 0,
        failed: 0
      }
    });

    // STEP 3: Send in-app broadcast to school
    emitToSchool(String(schoolId), 'broadcast_notification', {
      _id: notification._id,
      title,
      message,
      type,
      createdAt: new Date()
    });

    // STEP 4: Process each recipient individually
    const results = [];
    const allDeliveryLogs = [];

    for (const recipient of validRecipients) {
      // Create individual notification record
      const individualNotification = await Notification.create({
        recipient: recipient.userId,
        recipients: [{ kind: 'user', id: recipient.userId }],
        tenantId: schoolId,
        school: schoolId,
        branch: branchId || recipient.branchId,
        title,
        message,
        messageType: type,
        priority,
        channels: ['in_app'],
        templateCode,
        language,
        createdBy,
        status: 'completed',
        deliverySummary: {
          total: channels.length,
          sent: 1,
          delivered: 0,
          opened: 0,
          failed: 0
        }
      });

      // Send in-app
      emitToUser(String(recipient.userId), 'notification', {
        _id: individualNotification._id,
        title,
        message,
        type,
        createdAt: individualNotification.createdAt
      });

      // Process other channels
      const recipientResult = await sendNotification({
        recipientId: recipient.userId,
        schoolId,
        branchId: branchId || recipient.branchId,
        title,
        message,
        type,
        priority,
        channels: channels.filter(c => c !== 'in_app'),
        templateCode,
        language,
        createdBy
      });

      if (recipientResult) {
        results.push(recipientResult);
        if (recipientResult.deliveryLogs) {
          allDeliveryLogs.push(...recipientResult.deliveryLogs);
        }
      }
    }

    // Update master notification
    notification.status = 'completed';
    notification.deliverySummary.sent = results.length;
    await notification.save();

    return {
      success: true,
      notification,
      results,
      deliveryLogs: allDeliveryLogs,
      resolutionErrors
    };
  } catch (error) {
    console.error('[NotificationService] Broadcast error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to all parents of students in a class
 */
export const sendToClassParents = async ({
  classId,
  schoolId,
  branchId,
  title,
  message,
  type,
  channels = ['in_app', 'push', 'email'],
  createdBy = null
}) => {
  // Get all students in the class
  const students = await User.find({
    class: classId,
    school: schoolId,
    role: 'student',
    status: 'active',
    isDeleted: false
  }).select('parentPhone parentEmail linkedStudents').lean();

  // Collect parent user IDs
  const parentIds = [];
  for (const student of students) {
    if (student.linkedStudents?.length > 0) {
      for (const parentId of student.linkedStudents) {
        parentIds.push(parentId);
      }
    }
  }

  // Remove duplicates
  const uniqueParentIds = [...new Set(parentIds.map(id => String(id)))];

  return broadcastNotification({
    recipientIds: uniqueParentIds,
    schoolId,
    branchId,
    title,
    message,
    type,
    channels,
    createdBy
  });
};

/**
 * Get delivery logs for a notification
 */
export const getDeliveryLogs = async (notificationId, schoolId) => {
  return await DeliveryLog.find({
    notificationId,
    tenantId: schoolId
  }).sort({ createdAt: -1 }).lean();
};

/**
 * Update delivery log status
 */
export const updateDeliveryStatus = async (logId, status, providerResponse = null) => {
  const updateData = {
    status,
    lastAttemptAt: new Date()
  };

  if (status === 'sent') updateData.sentAt = new Date();
  if (status === 'delivered') updateData.deliveredAt = new Date();
  if (status === 'opened') updateData.openedAt = new Date();
  if (status === 'failed') {
    updateData.failedAt = new Date();
    updateData.lastError = providerResponse?.message || 'Unknown error';
  }
  if (providerResponse) updateData.response = providerResponse;

  return await DeliveryLog.findByIdAndUpdate(logId, updateData, { new: true });
};

export default {
  sendNotification,
  broadcastNotification,
  sendToClassParents,
  getDeliveryLogs,
  updateDeliveryStatus,
  resolveRecipient,
  resolveRecipients
};
