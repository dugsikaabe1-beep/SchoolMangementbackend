import express from 'express';
import DeliveryLog from '../models/DeliveryLog.js';
import Notification from '../models/Notification.js';

const router = express.Router();

/**
 * Generic provider webhook updater.
 * Expected body: { provider: 'twilio'|'nodemailer'|..., providerMessageId: string, status: 'delivered'|'failed'|'opened'|'bounced', details?: {} }
 */
router.post('/provider-event', async (req, res) => {
  try {
    const { provider, providerMessageId, status, details } = req.body;
    if (!provider || !providerMessageId || !status) return res.status(400).json({ success: false, message: 'Missing fields' });

    const log = await DeliveryLog.findOne({ provider, providerMessageId });
    if (!log) {
      return res.status(404).json({ success: false, message: 'DeliveryLog not found' });
    }

    log.status = status;
    if (status === 'delivered') log.deliveredAt = new Date();
    if (status === 'opened' || status === 'read') log.openedAt = new Date();
    if (status === 'failed' || status === 'bounced') log.failedAt = new Date();
    log.response = details || log.response;
    await log.save();

    // Update notification summary counters
    if (log.notificationId) {
      const inc = {};
      if (status === 'delivered') inc['deliverySummary.delivered'] = 1;
      if (status === 'opened' || status === 'read') inc['deliverySummary.opened'] = 1;
      if (status === 'failed' || status === 'bounced') inc['deliverySummary.failed'] = 1;
      if (Object.keys(inc).length) {
        await Notification.findByIdAndUpdate(log.notificationId, { $inc: inc });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[NotificationWebhooks] Error handling provider event', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
