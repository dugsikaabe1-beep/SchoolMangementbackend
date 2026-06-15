import express from 'express';
import DeliveryLog from '../models/DeliveryLog.js';
import Notification from '../models/Notification.js';

const router = express.Router();

// Twilio status callback
router.post('/twilio', async (req, res) => {
  try {
    // Twilio sends application/x-www-form-urlencoded with MessageSid and MessageStatus
    const messageSid = req.body.MessageSid || req.body.SmsSid;
    const messageStatus = (req.body.MessageStatus || req.body.SmsStatus || '').toLowerCase();
    if (!messageSid || !messageStatus) return res.status(400).send('Missing MessageSid or MessageStatus');

    const mapping = {
      queued: 'queued',
      sending: 'sent',
      sent: 'sent',
      delivered: 'delivered',
      failed: 'failed',
      undelivered: 'failed'
    };

    const status = mapping[messageStatus] || messageStatus;

    const log = await DeliveryLog.findOne({ provider: /twilio/i, providerMessageId: messageSid });
    if (!log) {
      // Try matching by providerMessageId only
      const alt = await DeliveryLog.findOne({ providerMessageId: messageSid });
      if (!alt) return res.status(404).send('Log not found');
      alt.status = status;
      if (status === 'delivered') alt.deliveredAt = new Date();
      if (status === 'failed') alt.failedAt = new Date();
      await alt.save();
      if (alt.notificationId) await Notification.findByIdAndUpdate(alt.notificationId, { $inc: status === 'delivered' ? { 'deliverySummary.delivered': 1 } : { 'deliverySummary.failed': 1 } });
      return res.send('OK');
    }

    log.status = status;
    if (status === 'delivered') log.deliveredAt = new Date();
    if (status === 'failed') log.failedAt = new Date();
    await log.save();

    if (log.notificationId) {
      await Notification.findByIdAndUpdate(log.notificationId, { $inc: status === 'delivered' ? { 'deliverySummary.delivered': 1 } : { 'deliverySummary.failed': 1 } });
    }

    res.send('OK');
  } catch (err) {
    console.error('[TwilioWebhook] error', err.message);
    res.status(500).send('ERROR');
  }
});

export default router;
