import DeliveryLog from '../models/DeliveryLog.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

/**
 * Simple notification worker (placeholder)
 * - Finds queued DeliveryLog entries
 * - Attempts a best-effort send (stub) and marks as sent/delivered/failed
 * - Updates Notification.deliverySummary counts
 *
 * Replace provider stubs with real provider adapter calls.
 */
import { resolveProvider } from './providerResolver.js';
import twilioProvider from './providers/twilioProvider.js';
import fcmProvider from './providers/fcmProvider.js';

export const processQueuedDeliveries = async (limit = 50) => {
  // Fetch queued logs
  const queued = await DeliveryLog.find({ status: 'queued' }).limit(limit);

  // Group logs by notificationId + recipient userId to apply prioritized fallback per recipient
  const groups = new Map();
  for (const log of queued) {
    const userId = String(log.to?.userId || 'unknown');
    const notifId = String(log.notificationId || 'no_notif');
    const key = `${notifId}::${userId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(log);
  }

  for (const [key, logs] of groups.entries()) {
    const sample = logs[0];
    let notification = null;
    if (sample.notificationId) notification = await Notification.findById(sample.notificationId).select('title message');

    const tenantId = sample.tenantId || sample.school;
    const userId = sample.to?.userId;

    // Fetch recipient contact details from User to find push token and phone
    let recipient = null;
    try {
      if (userId) recipient = await User.findById(userId).select('metadata phone').lean();
    } catch (e) {
      console.warn('[NotificationWorker] failed to fetch user for delivery fallback', userId, e.message || e);
    }

    // Priority order
    const priority = ['push', 'whatsapp', 'sms'];
    let sent = false;
    let lastError = null;
    for (const channel of priority) {
      if (sent) break;

      // Find a queued log for this exact channel if exists
      let log = logs.find((l) => l.channel === channel && l.status === 'queued');

      try {
        if (channel === 'push') {
          const token = recipient?.metadata?.pushToken || recipient?.metadata?.expoPushToken || sample.to?.pushToken || null;
          if (!token) {
            continue; // try next channel
          }

          const providerConfig = await resolveProvider({ tenantId, schoolId: sample.school, channel: 'push' });
          const result = await fcmProvider.sendPush({ token, title: notification?.title, body: notification?.message, data: { _providerConfig: providerConfig?.config || {} } });

          // Mark or create delivery log
          if (!log) {
            log = await DeliveryLog.create({
              notificationId: sample.notificationId,
              tenantId,
              school: sample.school,
              branch: sample.branch,
              channel: 'push',
              provider: providerConfig?.providerKey || 'fcm',
              to: { userId, name: sample.to?.name, role: sample.to?.role },
              status: result?.status || 'sent',
              providerMessageId: result?.providerMessageId || null,
              sentAt: new Date()
            });
          } else {
            log.provider = providerConfig?.providerKey || log.provider || 'fcm';
            log.providerMessageId = result?.providerMessageId || null;
            log.status = result?.status || 'sent';
            log.attempt = (log.attempt || 0) + 1;
            log.lastAttemptAt = new Date();
            log.sentAt = new Date();
            await log.save();
          }

          // Cancel other queued logs for this recipient+notification
          await DeliveryLog.updateMany({ notificationId: sample.notificationId, 'to.userId': userId, status: 'queued', _id: { $ne: log._id } }, { $set: { status: 'cancelled', lastAttemptAt: new Date(), lastError: 'Delivered via higher priority channel' } });

          // Update notification summary
          if (sample.notificationId) {
            await Notification.findByIdAndUpdate(sample.notificationId, { $inc: { 'deliverySummary.total': 1, 'deliverySummary.sent': 1 } });
          }

          sent = true;
          break;
        }

        if (channel === 'whatsapp') {
          const phone = recipient?.phone || sample.to?.phone;
          if (!phone) continue;
          const providerConfig = await resolveProvider({ tenantId, schoolId: sample.school, channel: 'whatsapp' });
          if (!providerConfig) continue;
          const result = await twilioProvider.sendWhatsApp({ to: phone, body: notification ? `${notification.title}\n\n${notification.message}` : sample.to?.phone, config: providerConfig?.config });

          if (!log) {
            log = await DeliveryLog.create({
              notificationId: sample.notificationId,
              tenantId,
              school: sample.school,
              branch: sample.branch,
              channel: 'whatsapp',
              provider: providerConfig?.providerKey || 'twilio_whatsapp',
              to: { userId, name: sample.to?.name, role: sample.to?.role, phone },
              status: result?.status || 'sent',
              providerMessageId: result?.providerMessageId || result?.response?.sid || null,
              sentAt: new Date()
            });
          } else {
            log.provider = providerConfig?.providerKey || log.provider || 'twilio_whatsapp';
            log.providerMessageId = result?.providerMessageId || result?.response?.sid || null;
            log.status = result?.status || 'sent';
            log.attempt = (log.attempt || 0) + 1;
            log.lastAttemptAt = new Date();
            log.sentAt = new Date();
            await log.save();
          }

          await DeliveryLog.updateMany({ notificationId: sample.notificationId, 'to.userId': userId, status: 'queued', _id: { $ne: log._id } }, { $set: { status: 'cancelled', lastAttemptAt: new Date(), lastError: 'Delivered via higher priority channel' } });

          if (sample.notificationId) {
            await Notification.findByIdAndUpdate(sample.notificationId, { $inc: { 'deliverySummary.total': 1, 'deliverySummary.sent': 1 } });
          }

          sent = true;
          break;
        }

        if (channel === 'sms') {
          const phone = recipient?.phone || sample.to?.phone;
          if (!phone) continue;
          const providerConfig = await resolveProvider({ tenantId, schoolId: sample.school, channel: 'sms' });
          if (!providerConfig) continue;
          const result = await twilioProvider.sendSMS({ to: phone, body: notification ? `${notification.title}\n\n${notification.message}` : sample.to?.phone, config: providerConfig?.config });

          if (!log) {
            log = await DeliveryLog.create({
              notificationId: sample.notificationId,
              tenantId,
              school: sample.school,
              branch: sample.branch,
              channel: 'sms',
              provider: providerConfig?.providerKey || 'twilio_sms',
              to: { userId, name: sample.to?.name, role: sample.to?.role, phone },
              status: result?.status || 'sent',
              providerMessageId: result?.providerMessageId || result?.response?.sid || null,
              sentAt: new Date()
            });
          } else {
            log.provider = providerConfig?.providerKey || log.provider || 'twilio_sms';
            log.providerMessageId = result?.providerMessageId || result?.response?.sid || null;
            log.status = result?.status || 'sent';
            log.attempt = (log.attempt || 0) + 1;
            log.lastAttemptAt = new Date();
            log.sentAt = new Date();
            await log.save();
          }

          await DeliveryLog.updateMany({ notificationId: sample.notificationId, 'to.userId': userId, status: 'queued', _id: { $ne: log._id } }, { $set: { status: 'cancelled', lastAttemptAt: new Date(), lastError: 'Delivered via higher priority channel' } });

          if (sample.notificationId) {
            await Notification.findByIdAndUpdate(sample.notificationId, { $inc: { 'deliverySummary.total': 1, 'deliverySummary.sent': 1 } });
          }

          sent = true;
          break;
        }
      } catch (err) {
        console.error('[NotificationWorker] fallback send error', channel, err.message || err);
        lastError = err;
        // try next channel
      }
    }

    if (!sent) {
      // If none of the channels succeeded, increment attempts and mark retry/failed accordingly
      for (const log of logs) {
        try {
          log.attempt = (log.attempt || 0) + 1;
          log.lastAttemptAt = new Date();
          log.lastError = lastError?.message || String(lastError || 'No provider available');
          if (log.attempt < 3) {
            log.status = 'queued';
          } else {
            log.status = 'failed';
            log.failedAt = new Date();
            if (log.notificationId) {
              await Notification.findByIdAndUpdate(log.notificationId, { $inc: { 'deliverySummary.failed': 1 } });
            }
          }
          await log.save();
        } catch (e) {
          console.error('[NotificationWorker] error updating failed log', e.message || e);
        }
      }
    }
  }

  return queued.length;
};

export default { processQueuedDeliveries };
