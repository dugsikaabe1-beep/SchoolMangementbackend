import DeliveryLog from '../models/DeliveryLog.js';
import Notification from '../models/Notification.js';

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
import africastalkingProvider from './providers/africastalkingProvider.js';
import metaWhatsappProvider from './providers/metaWhatsappProvider.js';
import fcmProvider from './providers/fcmProvider.js';
export const processQueuedDeliveries = async (limit = 50) => {
  const queued = await DeliveryLog.find({ status: 'queued' }).limit(limit);
  for (const log of queued) {
    try {
      // Resolve provider for the channel
      const providerConfig = await resolveProvider({ tenantId: log.tenantId, schoolId: log.school, channel: log.channel });
      let result = null;

      // Load notification for message content
      const notification = log.notificationId ? await Notification.findById(log.notificationId).select('title message') : null;
      const body = notification ? `${notification.title}\n\n${notification.message}` : '';

      if (log.channel === 'sms') {
        // Prefer explicit providerKey if set, otherwise resolver
        const key = (providerConfig && providerConfig.providerKey) || log.provider;
        if (key && key.includes('twilio')) {
          result = await twilioProvider.sendSMS({ to: log.to?.phone, body, config: providerConfig?.config });
        } else if (key && key.includes('africastalking')) {
          result = await africastalkingProvider.sendSMS({ to: log.to?.phone, body, config: providerConfig?.config });
        } else {
          throw new Error('No SMS provider configured');
        }
      } else if (log.channel === 'whatsapp') {
        const key = (providerConfig && providerConfig.providerKey) || log.provider;
        result = await metaWhatsappProvider.sendWhatsAppTemplate({ to: log.to?.phone, templateName: 'default', components: [{ type: 'body', parameters: [{ type: 'text', text: body }] }], token: providerConfig?.config?.token || process.env.META_WHATSAPP_TOKEN, config: providerConfig?.config });
      } else if (log.channel === 'push') {
        const token = log.to?.pushToken || null;
        if (!token && log.to?.userId && notification) {
          // If we only have userId, we might fetch their device token — skip for now
        }
        result = await fcmProvider.sendPush({ token, title: notification?.title, body: notification?.message, data: { _providerConfig: providerConfig?.config || {} } });
      } else {
        throw new Error(`Unsupported channel ${log.channel}`);
      }

      // Mark as sent/delivered depending on provider response
      log.provider = providerConfig?.providerKey || log.provider || 'unknown';
      log.providerMessageId = result?.providerMessageId || result?.response?.sid || result?.response?.message_id || null;
      log.status = result?.status || 'sent';
      log.attempt = (log.attempt || 0) + 1;
      log.lastAttemptAt = new Date();
      log.sentAt = new Date();
      await log.save();

      // Update notification delivery summary
      if (log.notificationId) {
        await Notification.findByIdAndUpdate(log.notificationId, {
          $inc: {
            'deliverySummary.total': 1,
            'deliverySummary.sent': 1
          }
        });
      }
    } catch (err) {
      console.error('[NotificationWorker] error processing log', log._id, err.message || err);
      try {
        log.attempt = (log.attempt || 0) + 1;
        log.lastAttemptAt = new Date();
        log.lastError = err.message || String(err);
        // Retry policy: up to 3 attempts
        if (log.attempt < 3) {
          log.status = 'queued';
          // small exponential backoff could be implemented by worker selection; for now leave queued
        } else {
          log.status = 'failed';
          log.failedAt = new Date();
          if (log.notificationId) {
            await Notification.findByIdAndUpdate(log.notificationId, { $inc: { 'deliverySummary.failed': 1 } });
          }
        }
        await log.save();
      } catch (e) {
        console.error('[NotificationWorker] failed to mark retry/failed', e.message || e);
      }
    }
  }
  return queued.length;
};

export default { processQueuedDeliveries };
