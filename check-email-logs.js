import dotenv from 'dotenv';
import mongoose from 'mongoose';
import EmailLog from './src/models/EmailLog.js';

dotenv.config();

async function checkEmailLogs() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const recentLogs = await EmailLog.find().sort({ createdAt: -1 }).limit(20);
    console.log('\n--- Recent Email Logs ---');
    recentLogs.forEach((log, i) => {
      console.log(`\n${i + 1}. To: ${log.to}`);
      console.log(`   Subject: ${log.subject}`);
      console.log(`   Provider: ${log.provider}`);
      console.log(`   Status: ${log.status}`);
      console.log(`   Message ID: ${log.messageId}`);
      console.log(`   Created At: ${log.createdAt}`);
      if (log.error) console.log(`   Error: ${log.error}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkEmailLogs();