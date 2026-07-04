import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Mark from '../models/Mark.js';
import MonthlyPayment from '../models/MonthlyPayment.js';
import Schedule from '../models/Schedule.js';
import Announcement from '../models/Announcement.js';
import PaymentSettings from '../models/PaymentSettings.js';
import Transaction from '../models/Transaction.js';
import PaymentService from '../services/PaymentService.js';
import { activeOnly } from '../utils/queryUtils.js';

const ensureParentAccess = async (req, studentId) => {
  const branchId = req.branchId || req.user.branch?._id || req.user.branch;
  const parent = await User.findById(req.user._id).select('linkedStudents role school branch');
  if (!parent || parent.role !== 'parent') {
    return { error: { status: 403, message: 'Parent access only' } };
  }
  const linked = (parent.linkedStudents || []).map((id) => id.toString());
  if (!linked.includes(studentId.toString())) {
    return { error: { status: 403, message: 'You can only access your linked children' } };
  }
  const student = await User.findOne(
    activeOnly({ _id: studentId, role: 'student', school: parent.school, branch: branchId })
  ).populate('class', 'name section');
  if (!student) {
    return { error: { status: 404, message: 'Student not found' } };
  }
  return { student, parent };
};

export const getParentChildren = async (req, res) => {
  try {
    const parent = await User.findById(req.user._id)
      .select('linkedStudents role school branch')
      .populate({
        path: 'linkedStudents',
        match: {
          school: req.user.school?._id || req.user.school,
          branch: req.branchId || req.user.branch?._id || req.user.branch,
          role: 'student',
        },
        select: 'name customId class branch status profileImage gender',
        populate: { path: 'class', select: 'name section' },
      });

    if (!parent || parent.role !== 'parent') {
      return res.status(403).json({ success: false, message: 'Parent access only' });
    }

    res.json({ success: true, data: parent.linkedStudents || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getChildProfile = async (req, res) => {
  try {
    const { error, student } = await ensureParentAccess(req, req.params.studentId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });
    res.json({ success: true, data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getChildAttendance = async (req, res) => {
  try {
    const { error, student } = await ensureParentAccess(req, req.params.studentId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const records = await Attendance.find(
      activeOnly({
        student: student._id,
        school: student.school,
        branch: student.branch,
      })
    )
      .sort({ date: -1 })
      .limit(100);

    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getChildResults = async (req, res) => {
  try {
    const { error, student } = await ensureParentAccess(req, req.params.studentId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const marks = await Mark.find(
      activeOnly({
        student: student._id,
        school: student.school,
        branch: student.branch,
      })
    )
      .populate('subject', 'name code')
      .populate('exam', 'name type')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: marks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getChildFees = async (req, res) => {
  try {
    const { error, student } = await ensureParentAccess(req, req.params.studentId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const payments = await MonthlyPayment.find(
      activeOnly({
        student: student._id,
        school: student.school,
        branch: student.branch,
      })
    )
      .populate('paymentMonth', 'name month year')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getChildTimetable = async (req, res) => {
  try {
    const { error, student } = await ensureParentAccess(req, req.params.studentId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (!student.class) {
      return res.json({ success: true, data: [] });
    }

    const schedules = await Schedule.find(
      activeOnly({
        class: student.class._id || student.class,
        school: student.school,
        branch: student.branch,
      })
    )
      .populate('subject', 'name code')
      .sort({ day: 1, startTime: 1 });

    res.json({ success: true, data: schedules });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getParentAnnouncements = async (req, res) => {
  try {
    const parent = await User.findById(req.user._id).select('linkedStudents school branch role');
    if (!parent || parent.role !== 'parent') {
      return res.status(403).json({ success: false, message: 'Parent access only' });
    }

    const children = await User.find({
      _id: { $in: parent.linkedStudents || [] },
      role: 'student',
      school: parent.school,
      branch: req.branchId || parent.branch,
    }).select('class branch');

    const classIds = children.map((c) => c.class).filter(Boolean);
    const branchIds = [...new Set(children.map((c) => c.branch?.toString()).filter(Boolean))];

    const announcements = await Announcement.find({
      school: parent.school,
      status: 'published',
      $or: [
        { audience: 'all' },
        { audience: 'parents' },
        { audience: 'class', targetClass: { $in: classIds } },
      ],
      ...(branchIds.length ? { branch: { $in: branchIds } } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: announcements });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const linkParentToStudents = async (req, res) => {
  try {
    const { parentId, studentIds } = req.body;
    if (!parentId || !Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({
        success: false,
        message: 'parentId and studentIds are required',
      });
    }

    const schoolId = req.user.school?._id || req.user.school;
    const parent = await User.findOne(
      activeOnly({ _id: parentId, role: 'parent', school: schoolId })
    );
    if (!parent) {
      return res.status(404).json({ success: false, message: 'Parent account not found' });
    }

    const validStudents = await User.find({
      _id: { $in: studentIds },
      role: 'student',
      school: schoolId,
      deletedAt: { $exists: false },
    }).select('_id');

    parent.linkedStudents = [
      ...new Set([
        ...(parent.linkedStudents || []).map((id) => id.toString()),
        ...validStudents.map((s) => s._id.toString()),
      ]),
    ];
    await parent.save();

    res.json({ success: true, data: parent.linkedStudents });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /parent/children/:studentId/payment-methods
 * Get payment methods for a child's school
 */
export const getParentPaymentMethods = async (req, res) => {
  try {
    const { error, student } = await ensureParentAccess(req, req.params.studentId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const paymentSettingsList = await PaymentSettings.find({ tenant: student.school, isActive: true });
    
    if (!paymentSettingsList || paymentSettingsList.length === 0) {
      return res.json({ providers: [] });
    }

    const enabledProviders = paymentSettingsList.map(settings => ({
      id: settings.provider,
      name: settings.displayName || settings.provider,
      description: settings.description || ''
    }));

    res.json({ providers: enabledProviders });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /parent/children/:studentId/payments/initiate
 * Initiate payment for a child
 */
export const initiateParentPayment = async (req, res) => {
  try {
    const { error, student } = await ensureParentAccess(req, req.params.studentId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const { monthlyPaymentId, providerId, studentId } = req.body;

    // Validate student ID is mandatory
    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required.' });
    }
    // Validate student ID matches the child
    if (studentId !== student.customId) {
      return res.status(403).json({ message: 'Student ID does not match the selected child.' });
    }

    const schoolId = student.school;
    const branchId = student.branch;

    // Get the monthly payment record
    const monthlyPayment = await MonthlyPayment.findOne({
      _id: monthlyPaymentId,
      student: student._id,
      school: schoolId,
      branch: branchId
    });

    if (!monthlyPayment) {
      return res.status(404).json({ message: 'Payment record not found.' });
    }

    if (monthlyPayment.status === 'PAID') {
      return res.status(400).json({ message: 'This month is already paid.' });
    }

    // Initiate payment
    const paymentResult = await PaymentService.initiatePayment({
      schoolId,
      branchId,
      providerId,
      amount: monthlyPayment.amount,
      currency: 'USD',
      reference: `${student.customId}-${monthlyPayment.month}-${monthlyPayment.year}`,
      studentId: student._id,
      studentName: student.name,
      monthlyPaymentId: monthlyPayment._id
    });

    res.json(paymentResult);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /parent/children/:studentId/payments/verify/:transactionId
 * Verify payment
 */
export const verifyParentPayment = async (req, res) => {
  try {
    const { error, student } = await ensureParentAccess(req, req.params.studentId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const { transactionId } = req.params;
    const schoolId = student.school;

    const result = await PaymentService.verifyPayment(transactionId, schoolId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /parent/children/:studentId/transactions
 * Get child's transaction history
 */
export const getParentTransactionHistory = async (req, res) => {
  try {
    const { error, student } = await ensureParentAccess(req, req.params.studentId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const schoolId = student.school;
    const branchId = student.branch;

    const transactions = await Transaction.find({
      studentId: student._id,
      school: schoolId,
      branch: branchId
    }).sort({ createdAt: -1 });

    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /parent/children/:studentId/payments/instructions/:providerId
 * Get payment instructions
 */
export const getParentPaymentInstructions = async (req, res) => {
  try {
    const { error, student } = await ensureParentAccess(req, req.params.studentId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const { providerId } = req.params;
    const { amount, studentId } = req.body;
    const schoolId = student.school;

    // Validate student ID is mandatory
    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required.' });
    }
    // Validate student ID matches the child
    if (studentId !== student.customId) {
      return res.status(403).json({ message: 'Student ID does not match the selected child.' });
    }

    const instructions = await PaymentService.getPaymentInstructions(
      providerId,
      schoolId,
      { amount, studentId }
    );

    res.json(instructions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /parent/children/:studentId/my-payments/:id/pay
 * Mark payment as paid for a child
 */
export const payChildMonthlyFee = async (req, res) => {
  const { id } = req.params;
  const { studentId } = req.body;

  try {
    const { error, student } = await ensureParentAccess(req, req.params.studentId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const schoolId = student.school;
    const branchId = student.branch;

    // Validate student ID is mandatory
    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required.' });
    }
    // Validate student ID matches the child
    if (studentId !== student.customId) {
      return res.status(403).json({ message: 'Student ID does not match the selected child.' });
    }

    // Find the payment record and ensure it belongs to this student
    const mp = await MonthlyPayment.findOne({
      _id: id,
      student: student._id,
      school: schoolId,
      branch: branchId
    });

    if (!mp) {
      return res.status(404).json({ message: 'Payment record not found.' });
    }

    if (mp.status === 'PAID') {
      return res.status(400).json({ message: 'This month is already paid.' });
    }

    // Mark as paid
    mp.status = 'PAID';
    mp.paymentDate = new Date();
    await mp.save();

    res.json({ message: 'Payment marked as paid successfully', success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export default {
  getParentChildren,
  getChildProfile,
  getChildAttendance,
  getChildResults,
  getChildFees,
  getChildTimetable,
  getParentAnnouncements,
  linkParentToStudents,
  getParentPaymentMethods,
  initiateParentPayment,
  verifyParentPayment,
  getParentTransactionHistory,
  getParentPaymentInstructions,
  payChildMonthlyFee,
};
