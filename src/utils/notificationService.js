import Notification from '../models/Notification.js';
import School from '../models/School.js';
import User from '../models/User.js';
import nodemailer from 'nodemailer';
import { emitToUser, emitToSchool } from './socket.js';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Check if a school has a specific communication module enabled in its plan.
 */
const checkPlanPermission = async (schoolId, moduleCode) => {
  try {
    const school = await School.findById(schoolId).select('settings.enabledModules');
    if (!school) return false;
    
    const modules = school.settings?.enabledModules || [];
    return modules.includes('ALL_MODULES') || modules.includes(moduleCode);
  } catch (error) {
    console.error(`[NotificationService] Permission check failed for ${moduleCode}:`, error.message);
    return false;
  }
};

/**
 * Send a notification to a single user
 * Supports in-app, email, sms, whatsapp, and push.
 * Respects Subscription Plan permissions.
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
  emailData = null,   // { to, subject, html }
  smsData = null,     // { to, body }
  whatsappData = null, // { to, body }
  pushData = null     // { token, data }
}) => {
  try {
    const usedChannels = ['in_app']; // In-app is always included if notifications module is on
    
    // 1. Check basic notification permission
    const canNotify = await checkPlanPermission(schoolId, 'notifications');
    if (!canNotify) {
      console.log(`[NotificationService] In-App notifications disabled for school ${schoolId}`);
      return null;
    }

    // 2. Create the notification record (In-App)
    const notification = await Notification.create({
      recipient: recipientId,
      school: schoolId,
      branch: branchId,
      title,
      message,
      type,
      priority,
      actionLink,
      metadata,
      channels: usedChannels
    });

    // 3. Real-time Delivery (Socket.io)
    emitToUser(String(recipientId), 'notification', {
      _id: notification._id,
      title,
      message,
      type,
      createdAt: notification.createdAt,
      actionLink
    });

    // 4. Email Integration
    if (emailData && (await checkPlanPermission(schoolId, 'email-automation'))) {
      try {
        await transporter.sendMail({
          from: `"DugsiKabe" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
          to: emailData.to,
          subject: emailData.subject || title,
          html: emailData.html
        });
        usedChannels.push('email');
        console.log(`[NotificationService] Email sent to ${emailData.to}`);
      } catch (emailError) {
        console.error('[NotificationService] Email delivery failed:', emailError.message);
      }
    }

    // 5. SMS Integration (Pluggable stubs)
    if (smsData && (await checkPlanPermission(schoolId, 'sms'))) {
      try {
        // TODO: Integrate with Twilio / Africa's Talking / etc.
        console.log(`[NotificationService] [STUB] SMS sent to ${smsData.to}: ${smsData.body}`);
        usedChannels.push('sms');
      } catch (smsError) {
        console.error('[NotificationService] SMS delivery failed:', smsError.message);
      }
    }

    // 6. WhatsApp Integration
    if (whatsappData && (await checkPlanPermission(schoolId, 'whatsapp'))) {
      try {
        // TODO: Integrate with Meta WhatsApp API / Twilio WhatsApp
        console.log(`[NotificationService] [STUB] WhatsApp sent to ${whatsappData.to}: ${whatsappData.body}`);
        usedChannels.push('whatsapp');
      } catch (waError) {
        console.error('[NotificationService] WhatsApp delivery failed:', waError.message);
      }
    }

    // 7. Push Notifications (FCM/Expo)
    if (pushData && (await checkPlanPermission(schoolId, 'push-notifications'))) {
      try {
        // TODO: Integrate with FCM or Expo Push SDK
        console.log(`[NotificationService] [STUB] Push notification sent to token: ${pushData.token}`);
        usedChannels.push('push');
      } catch (pushError) {
        console.error('[NotificationService] Push delivery failed:', pushError.message);
      }
    }

    // Update used channels in record
    notification.channels = usedChannels;
    await notification.save();

    return notification;
  } catch (error) {
    console.error('[NotificationService] Error sending notification:', error.message);
    return null;
  }
};

/**
 * Send broadcast notification to multiple users
 */
export const broadcastNotification = async ({ 
  recipientIds, 
  schoolId, 
  branchId, 
  title, 
  message, 
  type = 'announcement',
  priority = 'normal',
  channels = ['in_app']
}) => {
  try {
    const canNotify = await checkPlanPermission(schoolId, 'notifications');
    if (!canNotify) return null;

    const notifications = recipientIds.map(id => ({
      recipient: id,
      school: schoolId,
      branch: branchId,
      title,
      message,
      type,
      priority,
      channels
    }));

    const result = await Notification.insertMany(notifications);

    // Real-time broadcast
    emitToSchool(String(schoolId), 'broadcast_notification', {
      title,
      message,
      type,
      createdAt: new Date()
    });

    return result;
  } catch (error) {
    console.error('[NotificationService] Error broadcasting:', error.message);
    return null;
  }
};
