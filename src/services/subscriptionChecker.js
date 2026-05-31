import cron from 'node-cron';
import School from '../models/School.js';

/**
 * Subscription Checker Service
 * Automatically checks and handles expired subscriptions
 */

// Check for expired subscriptions and deactivate schools
const checkExpiredSubscriptions = async () => {
  console.log('[SubscriptionChecker] Running subscription expiration check...');
  
  try {
    const now = new Date();
    
    // Find schools with expired subscriptions that are still active
    const expiredSchools = await School.find({
      isActive: true,
      'subscription.endDate': { $lt: now },
      'subscription.blockedByAdmin': { $ne: true } // Don't override manual blocks
    });
    
    console.log(`[SubscriptionChecker] Found ${expiredSchools.length} expired subscriptions`);
    
    let deactivatedCount = 0;
    
    for (const school of expiredSchools) {
      // Deactivate the school
      school.isActive = false;
      school.subscription.paymentStatus = 'Unpaid';
      await school.save();
      
      deactivatedCount++;
      console.log(`[SubscriptionChecker] Deactivated school: ${school.name} (${school._id})`);
    }
    
    console.log(`[SubscriptionChecker] Complete: ${deactivatedCount} schools deactivated`);
    
    return {
      checked: expiredSchools.length,
      deactivated: deactivatedCount
    };
  } catch (error) {
    console.error('[SubscriptionChecker] Error:', error);
    throw error;
  }
};

// Send warnings for subscriptions expiring soon (optional)
const sendExpirationWarnings = async () => {
  console.log('[SubscriptionChecker] Checking for upcoming expirations...');
  
  try {
    const now = new Date();
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + 7); // 7 days from now
    
    // Find schools expiring in the next 7 days
    const expiringSoon = await School.find({
      isActive: true,
      'subscription.endDate': {
        $gte: now,
        $lte: warningDate
      },
      'subscription.paymentStatus': { $ne: 'Paid' }
    });
    
    console.log(`[SubscriptionChecker] Found ${expiringSoon.length} schools expiring soon`);
    
    // Here you could integrate with email/SMS service to send warnings
    for (const school of expiringSoon) {
      const daysUntilExpiry = Math.ceil((school.subscription.endDate - now) / (1000 * 60 * 60 * 24));
      console.log(`[SubscriptionChecker] Warning: ${school.name} expires in ${daysUntilExpiry} days`);
      
      // TODO: Send email/notification to school admin
      // await sendExpirationWarningEmail(school);
    }
    
    return {
      warningsSent: expiringSoon.length
    };
  } catch (error) {
    console.error('[SubscriptionChecker] Warning check error:', error);
    throw error;
  }
};

// Initialize subscription checker
export const initSubscriptionChecker = () => {
  // Run daily at 1:00 AM to check for expired subscriptions
  const expiryTask = cron.schedule('0 1 * * *', async () => {
    console.log('[SubscriptionChecker] Daily expiry check started');
    await checkExpiredSubscriptions();
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  // Run daily at 9:00 AM to send warnings
  const warningTask = cron.schedule('0 9 * * *', async () => {
    console.log('[SubscriptionChecker] Daily warning check started');
    await sendExpirationWarnings();
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  console.log('[SubscriptionChecker] Initialized - Daily checks scheduled');
  
  return {
    expiryTask,
    warningTask,
    checkExpiredSubscriptions,
    sendExpirationWarnings
  };
};

export default initSubscriptionChecker;
