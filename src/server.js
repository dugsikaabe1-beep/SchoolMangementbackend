import app from './app.js'; 
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import dotenv from 'dotenv';
import { runStartupDiagnostics } from './utils/diagnostics.js';
import migrateLegacySubjectsToClassSubjects from './utils/migrateClassSubjects.js';
import { initPaymentScheduler } from './services/paymentScheduler.js';
import { initPaymentReminders } from './services/paymentReminderService.js';
import { initSubscriptionChecker } from './services/subscriptionChecker.js';
import { scheduleAllTenantBackups } from './services/backupService.js';
import { initSocket } from './utils/socket.js';
import { initRedis, shutdownRedis } from './config/redis.js';

dotenv.config();

const PORT = process.env.PORT || 5001;

// Connect to MongoDB
const startServer = async () => {
  try {
    await connectDB();

    // Initialize Redis connections (MUST come before diagnostics & worker import)
    await initRedis();

    // Run startup diagnostics (non-fatal)
    try {
      await runStartupDiagnostics();
    } catch (diagErr) {
      console.warn('[Server] Startup diagnostics failed:', diagErr.message);
    }
    await migrateLegacySubjectsToClassSubjects();
    
    // Initialize automatic payment scheduler
    initPaymentScheduler();

    // Initialize payment reminders
    initPaymentReminders();
    
    // Initialize subscription checker for Super Admin
    initSubscriptionChecker();
    
    // Initialize scheduled backups
    scheduleAllTenantBackups(mongoose);
    
    // Check port availability before starting to prevent duplicate instances
    const isPortFree = await new Promise(async (resolve) => {
      const net = await import('net');
      const tester = net.createConnection({ port: PORT, host: '0.0.0.0' }, () => {
        // If we connected, port is in use
        tester.end();
        resolve(false);
      });
      tester.on('error', () => resolve(true));
    });

    if (!isPortFree) {
      console.error(`[Server] Port ${PORT} is already in use. Another instance may be running. Exiting.`);
      process.exit(1);
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT} (0.0.0.0)`);
    });

    // Initialize Socket.io
    initSocket(server);

    // ---- Graceful shutdown ----
    const gracefulShutdown = async (signal) => {
      console.log(`\n[Server] ${signal} received. Shutting down gracefully…`);
      server.close(async () => {
        await shutdownRedis();
        await mongoose.disconnect();
        console.log('[Server] All connections closed. Exiting.');
        process.exit(0);
      });
      // Force-exit after 10 s if graceful shutdown stalls
      setTimeout(() => {
        console.error('[Server] Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

