import mongoose from 'mongoose';
import cron from 'node-cron';
import MonthlyPayment from '../models/MonthlyPayment.js';
import PaymentMonth from '../models/PaymentMonth.js';
import User from '../models/User.js';
import School from '../models/School.js';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/**
 * Automatic Monthly Fee Charging System
 * Runs on the 1st day of every month at 00:01 AM
 */

// Get month name from date
const getMonthName = (date) => {
  return date.toLocaleString('default', { month: 'long' });
};

const generateMonthlyPayments = async (schoolId, month, year) => {
  const now = new Date();
  const targetMonth = month || getMonthName(now);
  const targetYear = year || now.getFullYear();
  const monthLabel = `${targetMonth} ${targetYear}`;

  console.log(`[PaymentScheduler] Generating payments for ${monthLabel} - School: ${schoolId}`);

  try {
    if (!schoolId) {
      throw new Error("Critical: schoolId is undefined in generateMonthlyPayments");
    }

    // 1. Get all students in the school regardless of enrollment date
    // This allows charging for past months even for new students as requested by user
    const schoolStudents = await User.find({
      role: 'student',
      school: schoolId,
      status: 'active'
    }).select('_id class name customId monthlyFees enrollmentDate');

    console.log(`[PaymentScheduler] Total active students found: ${schoolStudents.length}`);

    // 2. Filter by enrollment date ONLY if we are charging for a FUTURE month
    // For past and current months, we allow charging all active students
    const monthIndex = MONTHS.indexOf(targetMonth);
    const lastDayOfTargetMonth = new Date(targetYear, monthIndex + 1, 0, 23, 59, 59);
    
    const eligibleStudents = schoolStudents.filter(student => {
      // If student enrolled after the end of the target month, they might not be eligible
      // BUT the user specifically asked to be able to charge for any month
      // So we'll be more lenient. If it's a manual trigger (month/year provided), 
      // we'll charge them anyway if they are active now.
      
      if (month && year) {
        // Manual trigger - be lenient as per user request
        return true;
      }
      
      // Automatic trigger (1st of month) - only charge if enrolled by now
      if (student.enrollmentDate) {
        const studentEnrollment = new Date(student.enrollmentDate);
        if (studentEnrollment > lastDayOfTargetMonth) return false;
      }
      
      return true;
    });

    console.log(`[PaymentScheduler] Eligible students for ${monthLabel}: ${eligibleStudents.length}`);

    // 3. Get or create PaymentMonth for this month
    let paymentMonth = await PaymentMonth.findOne({
      month: targetMonth,
      year: targetYear,
      school: schoolId,
      assignTo: 'ALL',
    });

    if (!paymentMonth) {
      paymentMonth = await PaymentMonth.create({
        month: targetMonth,
        year: targetYear,
        monthLabel,
        amount: 0, // This is a placeholder, actual amounts are per-student
        assignTo: 'ALL',
        school: schoolId,
      });
    }

    let createdCount = 0;
    let skippedCount = 0;

    // 4. Generate payment record for each eligible student
    const paymentRecords = [];
    
    for (const student of eligibleStudents) {
      // Check if payment already exists
      const existingPayment = await MonthlyPayment.findOne({
        paymentMonth: paymentMonth._id,
        student: student._id,
        school: schoolId,
      });

      if (existingPayment) {
        skippedCount++;
        continue;
      }

      const feeAmount = student.monthlyFees || 0;

      paymentRecords.push({
        paymentMonth: paymentMonth._id,
        student: student._id,
        class: student.class,
        month: targetMonth,
        year: targetYear,
        monthLabel,
        amount: feeAmount,
        status: 'UNPAID',
        school: schoolId,
      });
      
      createdCount++;
    }

    if (paymentRecords.length > 0) {
      await MonthlyPayment.insertMany(paymentRecords, { ordered: false });
    }

    // 5. Update PaymentMonth stats accurately
    const totalPayments = await MonthlyPayment.countDocuments({ paymentMonth: paymentMonth._id, school: schoolId });
    const unpaidCount = await MonthlyPayment.countDocuments({ paymentMonth: paymentMonth._id, status: 'UNPAID', school: schoolId });
    const paidCount = await MonthlyPayment.countDocuments({ paymentMonth: paymentMonth._id, status: 'PAID', school: schoolId });

    paymentMonth.totalStudents = totalPayments;
    paymentMonth.unpaidCount = unpaidCount;
    paymentMonth.paidCount = paidCount;
    await paymentMonth.save();

    return { 
      createdCount, 
      skippedCount, 
      totalEligible: eligibleStudents.length,
      allStudentsInSchool: schoolStudents.length,
      month: targetMonth, 
      year: targetYear
    };

  } catch (error) {
    console.error('[PaymentScheduler] Error:', error);
    throw error;
  }
};

// Run for all schools
const runForAllSchools = async () => {
  console.log('[PaymentScheduler] Starting automatic payment generation...');
  
  try {
    const schools = await School.find({});
    console.log(`[PaymentScheduler] Found ${schools.length} schools`);

    for (const school of schools) {
      await generateMonthlyPayments(school._id);
    }

    console.log('[PaymentScheduler] All schools processed successfully');
  } catch (error) {
    console.error('[PaymentScheduler] Fatal error:', error);
  }
};

// Export the generate function for manual triggering
export { generateMonthlyPayments };

// Initialize scheduler
export const initPaymentScheduler = () => {
  // Run on 1st of every month at 00:01 AM
  // Cron format: minute hour day month day-of-week
  const task = cron.schedule('1 0 1 * *', async () => {
    console.log('[PaymentScheduler] Cron job triggered - 1st of month');
    await runForAllSchools();
  }, {
    scheduled: true,
    timezone: 'UTC', // Adjust based on your timezone
  });

  console.log('[PaymentScheduler] Initialized - Will run on 1st of every month at 00:01 UTC');

  // Also expose manual trigger for testing/admin use
  return {
    task,
    triggerManual: runForAllSchools,
    generateForSchool: generateMonthlyPayments,
  };
};

export default initPaymentScheduler;
