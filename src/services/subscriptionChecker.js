import cron from 'node-cron';
import School from '../models/School.js';
import User from '../models/User.js';
import { broadcastNotification } from '../utils/notificationService.js';

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
      school.subscription.status = 'Expired';
      await school.save();
      
      deactivatedCount++;
      console.log(`[SubscriptionChecker] Deactivated school: ${school.name} (${school._id})`);

      // Notify admins
      const admins = await User.find({ school: school._id, role: { $in: ['admin', 'schooladmin'] } });
      const adminIds = admins.map(a => a._id);
      if (adminIds.length > 0) {
        await broadcastNotification({
          recipientIds: adminIds,
          schoolId: school._id,
          title: 'Subscription Expired',
          message: `Your school's subscription has expired and your account has been temporarily deactivated. Please contact support to renew.`,
          type: 'alert'
        });
      }
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

// Send warnings for subscriptions expiring soon
const sendExpirationWarnings = async () => {
  console.log('[SubscriptionChecker] Checking for upcoming expirations...');
  
  try {
    const now = new Date();
    // We want to send warnings EXACTLY at 30, 15, 7, 3, 1 days remaining.
    // To avoid spamming every day, we check if the difference in days is exactly one of the targets.
    
    const warningDays = [30, 15, 7, 3, 1];
    let warningsSent = 0;

    for (const days of warningDays) {
      const targetStart = new Date(now);
      targetStart.setDate(targetStart.getDate() + days);
      targetStart.setHours(0, 0, 0, 0);
      
      const targetEnd = new Date(targetStart);
      targetEnd.setHours(23, 59, 59, 999);
      
      const expiringSoon = await School.find({
        isActive: true,
        'subscription.endDate': {
          $gte: targetStart,
          $lte: targetEnd
        },
        'subscription.paymentStatus': { $ne: 'Paid' } // Only warn if they haven't paid/renewed
      });

      for (const school of expiringSoon) {
        console.log(`[SubscriptionChecker] Warning: ${school.name} expires in ${days} days`);
        
        // Update status if <= 7 days
        if (days <= 7 && school.subscription.status !== 'Expiring Soon') {
          school.subscription.status = 'Expiring Soon';
          await school.save();
        }

        const admins = await User.find({ school: school._id, role: { $in: ['admin', 'schooladmin', 'school_admin'] } });
        const adminIds = admins.map(a => a._id);
        
        if (adminIds.length > 0) {
          await broadcastNotification({
            recipientIds: adminIds,
            schoolId: school._id,
            title: 'Subscription Expiring Soon',
            message: `Your school's subscription will expire in ${days} day(s). Please renew your plan to avoid service interruption.`,
            type: days <= 3 ? 'alert' : 'warning'
          });
          warningsSent++;
        }
      }
    }
    
    return {
      warningsSent
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
