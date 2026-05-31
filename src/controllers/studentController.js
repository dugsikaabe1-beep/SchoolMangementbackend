import User from '../models/User.js';
import Class from '../models/Class.js';
import ClassSubject from '../models/ClassSubject.js';
import Attendance from '../models/Attendance.js';
import Mark from '../models/Mark.js';
import Payment from '../models/Payment.js';
import Exam from '../models/Exam.js';
import MonthlyPayment from '../models/MonthlyPayment.js';
import PaymentMonth from '../models/PaymentMonth.js';
import Schedule from '../models/Schedule.js';
import School from '../models/School.js';
import ExamSession from '../models/ExamSession.js';

// --- View Class & Subjects ---
export const getStudentClassAndSubjects = async (req, res) => {
  try {
    const student = await User.findById(req.user._id).populate('class');
    if (!student.class) {
      return res.status(404).json({ message: 'No class assigned to this student' });
    }
    
    const classData = await Class.findById(student.class._id).populate('classTeacher');
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const assignments = await ClassSubject.find({
      class: student.class._id,
      school: req.user.school,
    })
      .populate('subject', 'name code')
      .populate('teacher', 'name profileImage');

    const subjects = assignments.map((a) => ({
      _id: a.subject?._id,
      name: a.subject?.name,
      code: a.subject?.code,
      teacher: a.teacher,
    }));

    res.json({ ...classData.toObject(), subjects });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- View Schedule ---
export const getStudentSchedule = async (req, res) => {
  try {
    if (!req.user.class) {
      return res.status(404).json({ message: 'No class assigned to this student' });
    }

    const schedules = await Schedule.find({ class: req.user.class, school: req.user.school })
      .populate('subject', 'name code')
      .populate('teacher', 'name')
      .sort({ day: 1, startTime: 1 });

    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- View Attendance ---
export const getStudentAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.find({ 
      user: req.user._id,
      school: req.user.school 
    }).sort({ date: -1 });
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Failed to fetch attendance. Please try again.'
    });
  }
};

// --- View Exam Results ---
export const getStudentResults = async (req, res) => {
  try {
    // Check if student has any unpaid fees
    const unpaidPayments = await MonthlyPayment.find({
      student: req.user._id,
      status: 'UNPAID',
    }).sort({ year: 1, createdAt: 1 });

    if (unpaidPayments.length > 0) {
      const totalDue = unpaidPayments.reduce((sum, p) => sum + p.amount, 0);
      const unpaidMonths = unpaidPayments.map(p => p.monthLabel || `${p.month} ${p.year}`);

      return res.status(403).json({
        isBlocked: true,
        message: 'You must clear all outstanding fees to view exam results',
        unpaidMonths,
        totalDue,
        studentInfo: {
          name: req.user.name,
          customId: req.user.customId,
          role: req.user.role
        }
      });
    }

  // Only return marks linked to an ExamSession (i.e., admin created the exam first)
    const examSessions = await ExamSession.find({ school: req.user.school });
    const examSessionIds = new Set(examSessions.map(e => e._id.toString()));

    const allMarks = await Mark.find({ student: req.user._id })
      .populate('subject', 'name code')
      .populate('class', 'name')
      .sort({ createdAt: -1 });

    // Filter: only marks that are linked to an existing exam session
    const results = allMarks.filter(m => m.exam && examSessionIds.has(m.exam.toString()));

    // If no exam sessions exist at all, return empty with a message
    if (!examSessions.length) {
      return res.json({
        allResults: [],
        position: null,
        rankingData: {},
        message: 'No exams have been created yet. Results will appear here once the school admin creates an exam.',
        studentInfo: { name: req.user.name, customId: req.user.customId, role: req.user.role }
      });
    }
      
    // Calculate global position based on all term marks combined
    let position = null;
    let rankingData = {
      monthly1: { rank: null, total: 0 },
      midterm: { rank: null, total: 0 },
      monthly2: { rank: null, total: 0 },
      final: { rank: null, total: 0 }
    };

    if (req.user.class) {
      const classId = req.user.class;
      const schoolId = req.user.school;
      
      const classStudents = await User.find({ class: classId, role: 'student', school: schoolId }).select('_id');
      const allClassMarks = await Mark.find({ class: classId, school: schoolId });
      
      // Define exam progression
      const examTypes = [
        { key: 'monthly1', fields: ['monthly1'] },
        { key: 'midterm', fields: ['monthly1', 'midterm'] },
        { key: 'monthly2', fields: ['monthly1', 'midterm', 'monthly2'] },
        { key: 'final', fields: ['monthly1', 'midterm', 'monthly2', 'final'] }
      ];

      examTypes.forEach(exam => {
        const studentTotals = classStudents.map(student => {
          const studentMarks = allClassMarks.filter(m => m.student.toString() === student._id.toString());
          // Sum up specified fields across all subjects for this student
          const total = studentMarks.reduce((sum, m) => {
            return sum + exam.fields.reduce((fSum, field) => fSum + (m[field] || 0), 0);
          }, 0);
          return { id: student._id.toString(), total };
        });

        studentTotals.sort((a, b) => b.total - a.total);
        
        let currentRank = 1;
        studentTotals.forEach((r, idx) => {
          if (idx > 0 && r.total < studentTotals[idx - 1].total) {
            currentRank = idx + 1;
          }
          if (r.id === req.user._id.toString()) {
            rankingData[exam.key].rank = currentRank;
            rankingData[exam.key].total = r.total;
          }
        });
      });

      // Global position is the Final rank (cumulative)
      position = rankingData.final.rank;
    }

    res.json({
      allResults: results,
      position,
      rankingData, // Added progressive ranking data
      studentInfo: {
        name: req.user.name,
        customId: req.user.customId,
        role: req.user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════
//  MONTHLY PAYMENT — STUDENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /student/my-payments
 * Returns all MonthlyPayment records assigned to the logged-in student,
 * plus summary totals.
 */
export const getMyMonthlyPayments = async (req, res) => {
  try {
    const payments = await MonthlyPayment.find({
      student: req.user._id,
      school: req.user.school,
    }).sort({ year: 1, createdAt: 1 });

    const paidPayments   = payments.filter(p => p.status === 'PAID');
    const unpaidPayments = payments.filter(p => p.status === 'UNPAID');

    const paidTotal   = paidPayments.reduce((s, p) => s + p.amount, 0);
    const unpaidTotal = unpaidPayments.reduce((s, p) => s + p.amount, 0);
    const paidCount   = paidPayments.length;
    const unpaidCount = unpaidPayments.length;

    // Tuition fee = amount of the earliest payment record (standard monthly rate)
    const tuitionFee = payments.length > 0 ? payments[0].amount : 0;

    // School's EVC Plus merchant number for USSD payment
    const school = await School.findById(req.user.school).select('merchantNumber name');
    const merchantNumber = school?.merchantNumber || '';

    res.json({
      payments,
      summary: {
        paidTotal,
        unpaidTotal,
        totalDue: unpaidTotal,
        paidCount,
        unpaidCount,
      },
      tuitionFee,
      merchantNumber,
      studentCustomId: req.user.customId || '',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /student/my-payments/:id/pay
 * Student pays one specific month.
 * Security: validates the record belongs to the requesting student.
 */
export const payMonthlyFee = async (req, res) => {
  const { id } = req.params;
  const { studentId } = req.body; // The student ID entered in the UI (for confirmation)

  try {
    // Find the payment record and ensure it belongs to this student
    const mp = await MonthlyPayment.findOne({
      _id: id,
      school: req.user.school,
    });

    if (!mp) {
      return res.status(404).json({ message: 'Payment record not found.' });
    }

    // Security: ensure the payment belongs to the authenticated student
    if (mp.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only pay your own fees.' });
    }

    // Optional: also cross-check the typed Student ID matches the authenticated user's customId
    if (studentId && studentId !== req.user.customId) {
      return res.status(403).json({ message: 'Student ID does not match your account.' });
    }

    if (mp.status === 'PAID') {
      return res.status(400).json({ message: 'This month is already paid.' });
    }

    // Mark as paid
    mp.status      = 'PAID';
    mp.paymentDate = new Date();
    mp.paidBy      = req.user._id;
    await mp.save();

    // Update the PaymentMonth aggregate counts
    const paidCount   = await MonthlyPayment.countDocuments({ paymentMonth: mp.paymentMonth, status: 'PAID',   school: req.user.school });
    const unpaidCount = await MonthlyPayment.countDocuments({ paymentMonth: mp.paymentMonth, status: 'UNPAID', school: req.user.school });
    await PaymentMonth.findByIdAndUpdate(mp.paymentMonth, { paidCount, unpaidCount });

    res.json({ message: 'Payment successful', payment: mp });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Legacy: View Fees Due (kept for backward compat) ---
export const getFeesDue = async (req, res) => {
  try {
    const monthlyFee = 500;
    const payments = await Payment.find({ student: req.user._id, status: 'Paid' });
    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    const hasPaidCurrentMonth = payments.some(p => p.month === currentMonth);
    res.json({
      monthlyFee,
      isCurrentMonthPaid: hasPaidCurrentMonth,
      dueAmount: hasPaidCurrentMonth ? 0 : monthlyFee,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Legacy: Pay Monthly Fees ---
export const payMonthlyFees = async (req, res) => {
  const { amount, paymentMethod, month } = req.body;
  try {
    const payment = await Payment.create({
      student: req.user._id,
      amount,
      paymentMethod,
      month,
      status: 'Paid',
      school: req.user.school,
      transactionId: `TXN-${Date.now()}-${req.user._id.toString().slice(-4)}`,
    });
    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// --- Legacy: View Payment History ---
export const getPaymentHistory = async (req, res) => {
  try {
    const history = await Payment.find({ student: req.user._id }).sort({ date: -1 });
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- View Student Dashboard Stats ---
export const getStudentDashboardStats = async (req, res) => {
  try {
    const studentId = req.user._id;
    const schoolId = req.user.school;
    
    const student = await User.findById(studentId).populate('class');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Return partial stats even if no class is assigned
    const stats = {
      studentId: student.customId,
      fullName: student.name,
      schoolName: '',
      subjects: [],
      results: [],
      attendance: { total: 0, present: 0, absent: 0, percentage: 0 },
      fees: { total: 0, paid: 0, remaining: 0 },
      className: student.class?.name || 'Not Assigned',
      section: student.class?.section || 'N/A',
      rank: null,
      monthlyFee: student.monthlyFees || student.class?.monthlyFees || 0
    };

    if (!student.class) {
      const school = await School.findById(schoolId).select('name');
      stats.schoolName = school?.name || 'N/A';
      return res.json(stats);
    }

    // Get school info
    const school = await School.findById(schoolId).select('name');

    // Calculate attendance
    const totalAttendance = await Attendance.countDocuments({ user: studentId, school: schoolId });
    const presentAttendance = await Attendance.countDocuments({ user: studentId, status: 'Present', school: schoolId });
    const absentAttendance = await Attendance.countDocuments({ user: studentId, status: 'Absent', school: schoolId });
    const attendancePercentage = totalAttendance > 0 ? (presentAttendance / totalAttendance) * 100 : 0;

    // Get subjects
    const subjectAssignments = await ClassSubject.find({ 
      class: student.class._id, 
      school: schoolId 
    }).populate('subject', 'name code');

    const subjects = subjectAssignments
      .filter(a => a.subject)
      .map(a => ({
        _id: a.subject._id,
        name: a.subject.name,
        code: a.subject.code
      }));

    // Get results
    const marks = await Mark.find({ 
      student: studentId, 
      school: schoolId 
    }).populate('subject', 'name code');

    const results = marks.map(m => {
      const totalMarks = (m.monthly1 || 0) + (m.midterm || 0) + (m.monthly2 || 0) + (m.final || 0);
      const maxMarks = 400; // 100 per exam
      const percentage = maxMarks > 0 ? (totalMarks / maxMarks) * 100 : 0;
      
      let grade = 'F';
      if (percentage >= 90) grade = 'A+';
      else if (percentage >= 80) grade = 'A';
      else if (percentage >= 70) grade = 'B';
      else if (percentage >= 60) grade = 'C';
      else if (percentage >= 50) grade = 'D';
      
      const status = percentage >= 50 ? 'Pass' : 'Fail';

      return {
        _id: m._id,
        subject: m.subject?.name || 'Unknown',
        subjectId: m.subject?._id,
        marks: totalMarks,
        percentage: percentage.toFixed(1),
        grade,
        status,
        monthly1: m.monthly1 || 0,
        midterm: m.midterm || 0,
        monthly2: m.monthly2 || 0,
        final: m.final || 0
      };
    });

    // Get fees info
    const payments = await MonthlyPayment.find({ 
      student: studentId, 
      school: schoolId 
    });

    const paidPayments = payments.filter(p => p.status === 'PAID');
    const unpaidPayments = payments.filter(p => p.status === 'UNPAID');
    
    const totalFees = payments.reduce((sum, p) => sum + p.amount, 0);
    const paid = paidPayments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = unpaidPayments.reduce((sum, p) => sum + p.amount, 0);

    // Get current month's monthly fee for the dashboard display
    const currentMonthlyFee = student.monthlyFees || student.class?.monthlyFees || 0;

    // Calculate rank
    const classStudents = await User.find({ class: student.class._id, role: 'student', school: schoolId });
    const studentAverages = await Promise.all(classStudents.map(async (s) => {
      const studentMarks = await Mark.find({ student: s._id, school: schoolId });
      if (studentMarks.length === 0) return { id: s._id, avg: 0 };
      const total = studentMarks.reduce((acc, m) => {
        return acc + (m.monthly1 || 0) + (m.midterm || 0) + (m.monthly2 || 0) + (m.final || 0);
      }, 0);
      return { id: s._id, avg: total / studentMarks.length };
    }));
    studentAverages.sort((a, b) => b.avg - a.avg);
    const rank = studentAverages.findIndex(s => s.id.toString() === studentId.toString()) + 1;

    res.json({
      // Student Info
      studentId: student.customId,
      fullName: student.name,
      schoolName: school?.name || 'N/A',
      monthlyFee: currentMonthlyFee,
      
      // Subjects
      subjects,
      
      // Results
      results,
      
      // Attendance
      attendance: {
        totalDays: totalAttendance,
        presentDays: presentAttendance,
        absentDays: absentAttendance,
        percentage: parseFloat(attendancePercentage.toFixed(1))
      },
      
      // Fees
      fees: {
        totalFees,
        paid,
        remaining
      },
      
      // Additional stats
      rank,
      totalStudents: classStudents.length,
      className: student.class?.name || 'Not Assigned',
      section: student.class?.section || 'N/A',
      
      // Legacy fields for backward compatibility
      attendancePercentage: Math.round(attendancePercentage),
      presentCount: presentAttendance,
      absentCount: absentAttendance,
      totalAttendance,
      subjectsCount: subjects.length,
      feesDue: remaining
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
