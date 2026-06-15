import cron from 'node-cron';
import MonthlyPayment from '../models/MonthlyPayment.js';
import User from '../models/User.js';
import { sendNotification } from '../utils/notificationService.js';

/**
 * Payment Reminder Service
 * 1. Reminders: 3 days before due date (assuming 10th of month is due date for this example, or we can use a setting)
 * 2. Overdue: 1 day after due date
 */

const DUES_DAY = 10; // Default due day of the month

export const initPaymentReminders = () => {
  // Run every day at 08:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('[PaymentReminderService] Checking for upcoming and overdue payments...');
    
    const today = new Date();
    const dayOfMonth = today.getDate();
    const monthName = today.toLocaleString('default', { month: 'long' });
    const year = today.getFullYear();

    try {
      // 1. Upcoming Reminders (3 days before due date)
      if (dayOfMonth === DUES_DAY - 3) {
        await sendReminders(monthName, year, 'upcoming');
      }

      // 2. Overdue Notifications (1 day after due date)
      if (dayOfMonth === DUES_DAY + 1) {
        await sendReminders(monthName, year, 'overdue');
      }
    } catch (error) {
      console.error('[PaymentReminderService] Error:', error);
    }
  });
};

const sendReminders = async (month, year, type) => {
  const query = {
    month,
    year,
    status: 'UNPAID'
  };

  const unpaidPayments = await MonthlyPayment.find(query).populate('student');
  console.log(`[PaymentReminderService] Found ${unpaidPayments.length} unpaid payments for ${type} reminder.`);

  for (const payment of unpaidPayments) {
    const student = payment.student;
    if (!student) continue;

    const title = type === 'upcoming' ? '⏰ Payment Reminder' : '⚠️ Overdue Payment';
    const message = type === 'upcoming' 
      ? `Your school fee for ${month} ${year} is due in 3 days.` 
      : `Your school fee for ${month} ${year} is now overdue. Please make payment immediately.`;

    // Notify Student
    await sendNotification({
      recipientId: student._id,
      schoolId: student.school,
      branchId: student.branch,
      title,
      message,
      type: 'finance',
      emailData: student.email ? { to: student.email, subject: title, html: `<p>${message}</p>` } : null
    });

    // Notify Parents
    const parents = await User.find({ role: 'parent', linkedStudents: student._id, school: student.school });
    for (const parent of parents) {
      await sendNotification({
        recipientId: parent._id,
        schoolId: parent.school,
        branchId: parent.branch,
        title: `${title}: ${student.name}`,
        message: `${type === 'upcoming' ? `The` : `Your child's`} school fee for ${student.name} (${month} ${year}) ${type === 'upcoming' ? 'is due in 3 days.' : 'is now overdue.'}`,
        type: 'finance',
        emailData: parent.email ? { to: parent.email, subject: title, html: `<p>${message}</p>` } : null
      });
    }
  }
};
