import { Queue } from 'bullmq';
import { getQueueConnection, isRedisAvailable } from '../config/redis.js';

let emailQueue;

const getQueue = () => {
  if (emailQueue) return emailQueue;

  if (!isRedisAvailable()) {
    console.warn('[EmailQueue] Redis not available (auth failed or not configured); email queue disabled');
    return null;
  }

  const connection = getQueueConnection();
  if (!connection) {
    console.warn('[EmailQueue] Redis not configured; email queue disabled');
    return null;
  }

  emailQueue = new Queue('email', { connection });
  console.log('[EmailQueue] ✅ Email queue connected');
  return emailQueue;
};

export const enqueueEmail = async (jobData, opts = {}) => {
  const q = getQueue();
  if (!q) {
    throw new Error('Email queue not available: Redis not configured or authentication failed');
  }
  return await q.add(
    'send-email',
    jobData,
    {
      attempts: opts.attempts || 3,
      backoff: { type: 'exponential', delay: 1000 },
    }
  );
};
