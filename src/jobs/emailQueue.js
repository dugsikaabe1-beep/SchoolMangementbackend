import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

export const emailQueue = new Queue('email', { connection });

export const enqueueEmail = async (jobData, opts = {}) => {
  return await emailQueue.add('send-email', jobData, { attempts: opts.attempts || 3, backoff: { type: 'exponential', delay: 1000 } });
};
