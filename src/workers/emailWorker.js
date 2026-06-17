import { Worker } from 'bullmq';
import { getWorkerConnection, isRedisAvailable } from '../config/redis.js';
import { sendEmailDirect } from '../utils/emailService.js';
import EmailLog from '../models/EmailLog.js';

const startWorker = async () => {
  if (!isRedisAvailable()) {
    console.warn('[EmailWorker] Redis not available (auth failed or not configured), skipping worker startup');
    return;
  }

  const connection = getWorkerConnection();
  if (!connection) {
    console.warn('[EmailWorker] Redis not configured, skipping worker startup');
    return;
  }

  try {
    await connection.connect();
  } catch (err) {
    console.error('[EmailWorker] ❌ Redis connection failed, worker NOT started:', err.message);
    return;
  }

  const worker = new Worker(
    'email',
    async (job) => {
      const data = job.data;
      const { to, subject, html, text, type, metadata, emailLogId, schoolId } = data;

      if (emailLogId) {
        try {
          await EmailLog.findByIdAndUpdate(emailLogId, {
            status: 'processing',
            startedAt: new Date(),
            $inc: { attempts: 1 },
          });
        } catch (err) {
          console.error('[EmailWorker] Failed to update EmailLog to processing:', err.message);
        }
      }

      try {
        const result = await sendEmailDirect({
          to, subject, html, text, type, metadata, emailLogId, schoolId,
        });
        console.log(`[EmailWorker] ✅ Job ${job.id} completed`);
        return { success: true, messageId: result.messageId };
      } catch (error) {
        console.error(`[EmailWorker] ❌ Job ${job.id} failed:`, error.message);
        if (emailLogId) {
          await EmailLog.findByIdAndUpdate(emailLogId, {
            status: 'failed',
            error: error.message,
            lastAttemptAt: new Date(),
          });
        }
        throw error;
      }
    },
    {
      connection,
      // CRITICAL: maxRetriesPerRequest must be null for BullMQ workers
      // (already set in the shared connection, but set here as a safety net)
      maxRetriesPerRequest: null,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[EmailWorker] Job ${job?.id} failed after all attempts:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[EmailWorker] Job ${job.id} completed`);
  });

  worker.on('error', (err) => {
    console.error('[EmailWorker] Worker-level error:', err.message);
  });

  console.log('[EmailWorker] 🚀 Worker started and connected');
};

startWorker();
