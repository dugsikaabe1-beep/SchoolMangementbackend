import app from './app.js'; 
import connectDB from './config/db.js';
import dotenv from 'dotenv';
import migrateLegacySubjectsToClassSubjects from './utils/migrateClassSubjects.js';
import { initPaymentScheduler } from './services/paymentScheduler.js';
import { initSubscriptionChecker } from './services/subscriptionChecker.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
const startServer = async () => {
  try {
    await connectDB();
    await migrateLegacySubjectsToClassSubjects();
    
    // Initialize automatic payment scheduler
    initPaymentScheduler();
    
    // Initialize subscription checker for Super Admin
    initSubscriptionChecker();
    
    app.listen(PORT, () => {
      console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
