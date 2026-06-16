import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { sendEmail } from '../utils/emailService.js';
import EmailLog from '../models/EmailLog.js';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const worker = new Worker('email', async (job) => {
  const data = job.data;
  const { to, subject, html, text, type, metadata, emailLogId } = data;

  // Update log to processing
  if (emailLogId) {
    try {
      await EmailLog.findByIdAndUpdate(emailLogId, { status: 'processing', startedAt: new Date() });
    } catch (err) {
      console.error('[EmailWorker] Failed to update EmailLog to processing:', err.message);
    }
  }

  try {
    const result = await sendEmail({ email: to, subject, html, text, type, metadata });
    if (emailLogId) {
      await EmailLog.findByIdAndUpdate(emailLogId, { status: 'sent', messageId: result.messageId, sentAt: new Date(), response: result });
    }
    return { success: true };
  } catch (error) {
    console.error('[EmailWorker] sendEmail failed:', error.message);
    if (emailLogId) {
      await EmailLog.findByIdAndUpdate(emailLogId, { status: 'failed', error: error.message, lastAttemptAt: new Date() });
    }
    throw error;
  }
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`[EmailWorker] Job ${job.id} failed:`, err.message);
});

worker.on('completed', (job) => {
  console.log(`[EmailWorker] Job ${job.id} completed`);
});

console.log('[EmailWorker] Worker started');
