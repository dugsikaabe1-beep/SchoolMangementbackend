import dotenv from 'dotenv';
import mongoose from 'mongoose';
import argv from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { sendNotification } from '../src/utils/notificationService.js';
import worker from '../src/services/notificationWorker.js';

dotenv.config({ path: process.env.ENV_PATH || '.env' });

const y = argv(hideBin(process.argv));
const args = y.argv;

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in environment');
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(MONGODB_URI, { autoIndex: false });
  console.log('Connected to MongoDB');

  const recipientId = args.recipientId || process.env.TEST_RECIPIENT_ID;
  const channels = (args.channels || process.env.TEST_CHANNELS || 'sms').split(',').map(s => s.trim());
  const message = args.message || process.env.TEST_MESSAGE || 'Test notification from CLI';
  const title = args.title || 'Test Notification';
  const schoolId = args.schoolId || process.env.TEST_SCHOOL_ID || null;
  const branchId = args.branchId || process.env.TEST_BRANCH_ID || null;

  if (!recipientId) {
    console.error('recipientId is required via --recipientId or TEST_RECIPIENT_ID');
    process.exit(1);
  }

  console.log('Creating notification via sendNotification...');
  try {
    const result = await sendNotification({
      recipientId,
      schoolId,
      branchId,
      title,
      message,
      channels,
      createdBy: null
    });

    console.log('sendNotification result:', !!result);

    console.log('Running queued delivery worker...');
    const processed = await worker.processQueuedDeliveries(50);
    console.log('Worker processed count:', processed);
  } catch (err) {
    console.error('Error sending test notification:', err.message || err);
  } finally {
    mongoose.disconnect();
  }
};

run().catch((e) => {
  console.error('Fatal error', e.message || e);
  process.exit(1);
});
