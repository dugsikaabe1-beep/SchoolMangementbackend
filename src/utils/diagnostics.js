import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis.js';

export const runStartupDiagnostics = async () => {
  const results = {};

  // MongoDB
  try {
    const state = mongoose.connection.readyState; // 1 = connected
    results.mongo = state === 1 ? { status: 'PASS' } : { status: 'FAIL', state };
  } catch (err) {
    results.mongo = { status: 'FAIL', error: err.message };
  }

  // Redis — use the centralized client (already connected via initRedis)
  const client = getRedisClient();
  if (!client) {
    results.redis = { status: 'SKIP', reason: 'REDIS_URL not set' };
  } else {
    try {
      const pong = await client.ping();
      results.redis = { status: pong === 'PONG' ? 'PASS' : 'FAIL', pong };
    } catch (err) {
      results.redis = { status: 'FAIL', error: err.message };
    }
  }

  // Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && typeof resendKey === 'string' && resendKey.startsWith('re_')) {
    results.resend = { status: 'PASS' };
  } else if (resendKey) {
    results.resend = { status: 'WARN', note: 'RESEND_API_KEY present but unexpected format' };
  } else {
    results.resend = { status: 'FAIL', reason: 'RESEND_API_KEY not set' };
  }

  // Queue
  results.queue = process.env.ENABLE_QUEUE === '1' || process.env.ENABLE_QUEUE === 'true' ? 'ENABLED' : 'DISABLED';

  // Scheduler
  results.scheduler = process.env.ENABLE_SCHEDULER === '1' || process.env.ENABLE_SCHEDULER === 'true' ? 'ENABLED' : 'DISABLED';

  // Environment
  results.env = {
    RESEND_API_KEY: resendKey ? 'SET' : 'MISSING',
    REDIS_URL: process.env.REDIS_URL ? 'SET' : 'MISSING',
    EMAIL_FROM: process.env.EMAIL_FROM ? 'SET' : 'MISSING',
  };

  console.log('[Diagnostics] Startup diagnostics:', JSON.stringify(results, null, 2));

  return results;
};
