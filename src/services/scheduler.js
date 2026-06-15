import ScheduledJob from '../models/ScheduledJob.js';
import Notification from '../models/Notification.js';
import DeliveryLog from '../models/DeliveryLog.js';

// Basic scheduler: finds due ScheduledJob entries and enqueues DeliveryLog records.
// NOTE: For production, replace with a dedicated queue (BullMQ/Redis) and separate worker process.
export const runScheduler = async (limit = 100) => {
  const now = new Date();
  const due = await ScheduledJob.find({ nextRunAt: { $lte: now }, status: 'scheduled' }).limit(limit);
  let processed = 0;
  for (const job of due) {
    try {
      const notif = await Notification.findById(job.notificationId);
      if (!notif) {
        job.status = 'failed';
        job.lastRunAt = now;
        await job.save();
        continue;
      }

      // Create queued delivery logs for each recipient & channel
      const recipients = notif.recipients || [];
      for (const r of recipients) {
        for (const ch of notif.channels || []) {
          await DeliveryLog.create({
            notificationId: notif._id,
            tenantId: notif.tenantId,
            school: notif.school,
            branch: notif.branch,
            channel: ch === 'in_app' ? 'in_app' : ch,
            provider: `scheduled_${ch}`,
            to: ch === 'email' ? { email: r.email } : ch === 'sms' || ch === 'whatsapp' ? { phone: r.phone } : { userId: r.id },
            status: 'queued'
          });
        }
      }

      notif.status = 'queued';
      await notif.save();

      // Update job: compute nextRunAt if recurrence exists
      job.lastRunAt = now;
      job.attempts = (job.attempts || 0) + 1;

      if (job.recurrenceRule && job.recurrenceRule.intervalDays) {
        const days = parseInt(job.recurrenceRule.intervalDays, 10) || 0;
        const next = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        job.nextRunAt = next;
      } else {
        job.status = 'completed';
        job.nextRunAt = null;
      }

      await job.save();
      processed++;
    } catch (err) {
      console.error('[Scheduler] error processing job', job._id, err.message);
      try {
        job.status = 'failed';
        job.lastRunAt = new Date();
        await job.save();
      } catch (e) {
        console.error('[Scheduler] failed to mark job as failed', e.message);
      }
    }
  }
  return processed;
};

export default { runScheduler };
