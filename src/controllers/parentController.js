import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Mark from '../models/Mark.js';
import MonthlyPayment from '../models/MonthlyPayment.js';
import Schedule from '../models/Schedule.js';
import Announcement from '../models/Announcement.js';
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

export default {
  getParentChildren,
  getChildProfile,
  getChildAttendance,
  getChildResults,
  getChildFees,
  getChildTimetable,
  getParentAnnouncements,
  linkParentToStudents,
};
