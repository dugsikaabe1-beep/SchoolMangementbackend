import mongoose from 'mongoose';
import cron from 'node-cron';
import MonthlyPayment from '../models/MonthlyPayment.js';
import PaymentMonth from '../models/PaymentMonth.js';
import User from '../models/User.js';
import School from '../models/School.js';
import { sendNotification } from '../utils/notificationService.js';
import { calculateStudentMonthlyFee } from '../utils/discountUtils.js';

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

const generateMonthlyPayments = async (schoolId, month, year, branchId = null, academicYear = null) => {
  const now = new Date();
  const targetMonth = month || getMonthName(now);
  const targetYear = year || now.getFullYear();
  const monthLabel = `${targetMonth} ${targetYear}`;
  const targetAcademicYear = academicYear || targetYear.toString();

  console.log(`[PaymentScheduler] Generating payments for ${monthLabel} - School: ${schoolId}, Branch: ${branchId || 'ALL'}`);

  try {
    if (!schoolId) {
      throw new Error("Critical: schoolId is undefined in generateMonthlyPayments");
    }

    // 1. Get all students in the school regardless of enrollment date
    // This allows charging for past months even for new students as requested by user
    const studentQuery = {
      role: 'student',
      school: schoolId,
      status: 'active'
    };
    
    // If a specific branch is selected, filter by it
    if (branchId) {
      studentQuery.branch = branchId;
    }

    const schoolStudents = await User.find(studentQuery).select('_id class name customId monthlyFees enrollmentDate branch school email currency').populate('class', 'name section');

    console.log(`[PaymentScheduler] Total active students found: ${schoolStudents.length}`);

    // 2. Filter by enrollment date ONLY if we are charging for a FUTURE month
    // For past and current months, we allow charging all active students
    const monthIndex = MONTHS.indexOf(targetMonth);
    const lastDayOfTargetMonth = new Date(targetYear, monthIndex + 1, 0, 23, 59, 59);
    
    const eligibleStudents = schoolStudents.filter(student => {
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
    const paymentMonthQuery = {
      month: targetMonth,
      year: targetYear,
      school: schoolId,
      assignTo: 'ALL',
    };
    
    if (branchId) {
      paymentMonthQuery.branch = branchId;
    }

    let paymentMonth = await PaymentMonth.findOne(paymentMonthQuery);

    if (!paymentMonth) {
      paymentMonth = await PaymentMonth.create({
        month: targetMonth,
        year: targetYear,
        monthLabel,
        amount: 0, // This is a placeholder, actual amounts are per-student
        assignTo: 'ALL',
        school: schoolId,
        branch: branchId || undefined,
        academicYear: targetAcademicYear,
      });
    }

    let createdCount = 0;
    let skippedCount = 0;

    // 4. Generate payment record for each eligible student
    const paymentRecords = [];
    
    for (const student of eligibleStudents) {
      // Check if payment already exists
      const existingPayment = await MonthlyPayment.findOne({
        student: student._id,
        month: targetMonth,
        year: targetYear,
        school: schoolId,
      });

      if (existingPayment) {
        skippedCount++;
        continue;
      }

      const baseAmount = student.monthlyFees || 0;
      const feeCalculation = await calculateStudentMonthlyFee(
        student,
        baseAmount,
        new Date(targetYear, Math.max(0, monthIndex), 1)
      );
      const feeAmount = feeCalculation.finalAmount;
      const academicYear = targetYear.toString();
      
      // Critical fix: ensure we have a valid branch ID for the student
      let finalBranchId = student.branch;
      
      if (!finalBranchId) {
        // If student has no branch, try to get the first active branch of the school
        const Branch = mongoose.model('Branch');
        const firstBranch = await Branch.findOne({ tenant: schoolId, status: 'active' });
        finalBranchId = firstBranch?._id;
      }

      if (!finalBranchId) {
        console.warn(`[PaymentScheduler] Skipping student ${student.name} (${student._id}) - No branch found for school ${schoolId}`);
        skippedCount++;
        continue;
      }

      paymentRecords.push({
        paymentMonth: paymentMonth._id,
        student: student._id,
        class: student.class,
        month: targetMonth,
        year: targetYear,
        monthLabel,
        amount: feeAmount,
        originalAmount: feeCalculation.originalAmount,
        discountAmount: feeCalculation.discountAmount,
        appliedDiscounts: feeCalculation.appliedDiscounts,
        status: 'UNPAID',
        school: schoolId,
        branch: finalBranchId,
        academicYear: academicYear,
      });
      
      createdCount++;
    }

    if (paymentRecords.length > 0) {
      await MonthlyPayment.insertMany(paymentRecords, { ordered: false });
      
      // Notify Students & Parents
      for (const student of eligibleStudents) {
        const calculation = await calculateStudentMonthlyFee(
          student,
          student.monthlyFees || 0,
          new Date(targetYear, Math.max(0, monthIndex), 1)
        );
        const amount = calculation.finalAmount;
        if (amount > 0) {
          const title = 'School Fee Generated';
          const message = `Monthly school fee for ${monthLabel} has been generated: ${amount} ${student.currency || 'USD'}.`;
          
          // Notify Student
          await sendNotification({
            recipientId: student._id,
            schoolId,
            branchId: student.branch,
            title,
            message,
            type: 'finance',
            emailData: student.email ? { to: student.email, subject: title, html: `<p>${message}</p>` } : null
          });

          // Notify Parent (Standalone Account)
          const parents = await User.find({ role: 'parent', linkedStudents: student._id, school: schoolId });
          for (const parent of parents) {
            await sendNotification({
              recipientId: parent._id,
              schoolId,
              branchId: parent.branch,
              title: `Fee Generated: ${student.name}`,
              message: `Monthly school fee for ${student.name} (${monthLabel}) has been generated: ${amount} ${student.currency || 'USD'}.`,
              type: 'finance',
              emailData: parent.email ? { to: parent.email, subject: title, html: `<p>${message}</p>` } : null
            });
          }
        }
      }
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
