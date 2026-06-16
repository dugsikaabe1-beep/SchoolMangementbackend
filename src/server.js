import app from './app.js'; 
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import dotenv from 'dotenv';
import migrateLegacySubjectsToClassSubjects from './utils/migrateClassSubjects.js';
import { initPaymentScheduler } from './services/paymentScheduler.js';
import { initPaymentReminders } from './services/paymentReminderService.js';
import { initSubscriptionChecker } from './services/subscriptionChecker.js';
import { scheduleAllTenantBackups } from './services/backupService.js';
import { initSocket } from './utils/socket.js';

dotenv.config();

const PORT = process.env.PORT || 5001;

// Connect to MongoDB
const startServer = async () => {
  try {
    await connectDB();
    await migrateLegacySubjectsToClassSubjects();
    
    // Initialize automatic payment scheduler
    initPaymentScheduler();

    // Initialize payment reminders
    initPaymentReminders();
    
    // Initialize subscription checker for Super Admin
    initSubscriptionChecker();
    
    // Initialize scheduled backups
    scheduleAllTenantBackups(mongoose);
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT} (0.0.0.0)`);
    });

    // Initialize Socket.io
    initSocket(server);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

