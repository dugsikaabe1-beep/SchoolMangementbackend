import Subscription from '../models/Subscription.js';
import School from '../models/School.js';
import { sendNotification } from './notificationService.js';
import { subscriptionActivatedEmail } from './emailTemplates.js';

export const checkSubscriptions = async () => {
  try {
    const now = new Date();
    
    // 1. Find subscriptions expiring in 3 days for warnings
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + 3);
    
    const warningSubs = await Subscription.find({
      status: 'active',
      endDate: { $lte: threeDaysFromNow, $gt: now }
    }).populate('school');

    for (const sub of warningSubs) {
      await sendNotification({
        recipientId: sub.school.admin, // Assuming school has an admin field
        schoolId: sub.school._id,
        title: 'Subscription Expiring Soon',
        message: `Your subscription will expire on ${sub.endDate.toLocaleDateString()}. Please renew to avoid service interruption.`,
        type: 'warning'
      });
    }

    // 2. Handle expired subscriptions
    const expiredSubs = await Subscription.find({
      status: { $in: ['active', 'trialing'] },
      endDate: { $lte: now }
    }).populate('school');

    for (const sub of expiredSubs) {
      sub.status = 'expired';
      await sub.save();
      
      // Deactivate school if grace period is over (e.g., 2 days)
      const gracePeriodEnd = new Date(sub.endDate);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 2);
      
      if (now > gracePeriodEnd) {
        await School.findByIdAndUpdate(sub.school._id, { isActive: false });
        
        await sendNotification({
          recipientId: sub.school.admin,
          schoolId: sub.school._id,
          title: 'Subscription Expired',
          message: 'Your subscription has expired and your school account has been deactivated. Please contact support to renew.',
          type: 'danger'
        });
      }
    }

    console.log(`[SubscriptionChecker] Checked ${warningSubs.length + expiredSubs.length} subscriptions.`);
  } catch (error) {
    console.error('[SubscriptionChecker] Error:', error.message);
  }
};
