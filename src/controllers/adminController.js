import User from '../models/User.js';
import School from '../models/School.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import ClassSubject from '../models/ClassSubject.js';
import Attendance from '../models/Attendance.js';
import Exam from '../models/Exam.js';
import ExamSession from '../models/ExamSession.js';
import Mark from '../models/Mark.js';
import Payment from '../models/Payment.js';
import PaymentMonth from '../models/PaymentMonth.js';
import MonthlyPayment from '../models/MonthlyPayment.js';
import Schedule from '../models/Schedule.js';
import Branch from '../models/Branch.js';
import SchoolFeatureOverride from '../models/SchoolFeatureOverride.js';
import { getCurrentAcademicYear } from '../utils/academicUtils.js';
import { getEnabledFeaturesForSchool } from '../utils/featureAccess.js';
import { generateCustomId } from '../utils/schoolUtils.js';
import { logFinanceAction } from '../utils/financeAuditLogger.js';
import { broadcastNotification, sendNotification } from '../utils/notificationService.js';
import { restoreRecord } from '../utils/queryUtils.js';
import { generatePdf } from '../utils/pdfGenerator.js';
import Certificate from '../models/Certificate.js';
import IDCardDesign from '../models/IDCardDesign.js';
import Admission from '../models/Admission.js';
import CalendarEvent from '../models/CalendarEvent.js';
import AuditLog from '../models/AuditLog.js';
import { logActivity } from '../utils/activityLogger.js';
import { logAction } from '../utils/auditLogger.js';
import PromotionHistory from '../models/PromotionHistory.js';
import FeeStructure from '../models/FeeStructure.js';
import Discount from '../models/Discount.js';
import DiscountAssignment from '../models/DiscountAssignment.js';
import ApprovalRequest from '../models/ApprovalRequest.js';
import Asset from '../models/Asset.js';
import LibraryBook from '../models/LibraryBook.js';
import LibraryIssue from '../models/LibraryIssue.js';
import TransportRoute from '../models/TransportRoute.js';
import TransportVehicle from '../models/TransportVehicle.js';
import Hostel from '../models/Hostel.js';
import HostelRoom from '../models/HostelRoom.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import {
  calculateDiscountedAmount,
  calculateStudentMonthlyFee,
  getActiveDiscountAssignmentsForStudent,
  resolveDiscountEndDate,
} from '../utils/discountUtils.js';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// Helper function to resolve branch ID
const resolveBranchId = async (req) => {
  // If explicitly set to null (ALL_BRANCHES), return null
  if (req.branchId === null) {
    return null;
  }
  
  let branchId = req.branchId || req.user?.branch;
  
  if (!branchId) {
    const schoolId = req.user.school?._id || req.user.school;
    let branch = await Branch.findOne({ 
      tenant: schoolId, 
      status: 'active', 
      deletedAt: { $exists: false },
      $or: [{ name: 'Main Branch' }, { code: 'MAIN' }]
    }).sort({ createdAt: 1 });

    if (!branch) {
      branch = await Branch.findOne({ tenant: schoolId, status: 'active', deletedAt: { $exists: false } }).sort({ createdAt: 1 });
    }

    if (!branch) {
      branch = await Branch.create({
        tenant: schoolId,
        name: 'Main Branch',
        code: 'MAIN',
        status: 'active',
        createdBy: req.user._id
      });
    }
    branchId = branch._id;
  }
  return branchId;
};

// Helper function to calculate grade
const calculateGrade = (avg) => {
  if (avg >= 90) return 'A+';
  if (avg >= 80) return 'A';
  if (avg >= 70) return 'B+';
  if (avg >= 60) return 'B';
  if (avg >= 50) return 'C';
  if (avg >= 40) return 'D';
  return 'F';
};

// --- Certificate Generator ---
export const generateCertificate = async (req, res) => {
  const { studentId, type, title, achievementName } = req.body;
  const schoolId = req.user.school?._id || req.user.school;
  try {
    const student = await User.findById(studentId).populate('school');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const school = await School.findById(schoolId);
    
    const certificate = await Certificate.create({
      school: schoolId,
      branch: req.branchId,
      student: studentId,
      academicYear: req.academicYearId,
      type,
      title,
      verificationNumber: `CERT-${uuidv4().split('-')[0].toUpperCase()}`,
      content: { achievementName },
      issuedBy: req.user._id
    });

    const pdfBuffer = await generatePdf('certificate', {
      schoolLogo: school.logo?.url,
      schoolName: school.name,
      schoolAddress: school.address,
      certificateTitle: title,
      studentName: student.name,
      achievementName,
      academicYear: req.academicYearName,
      verificationNumber: certificate.verificationNumber,
      principalName: school.principalName || 'Principal'
    });

    res.contentType('application/pdf');
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Online Admission System ---
export const getAdmissions = async (req, res) => {
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const admissions = await Admission.find({ school: schoolId }).populate('class');
    res.json(admissions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateAdmissionStatus = async (req, res) => {
  const { id } = req.params;
  const { status, reviewNotes } = req.body;
  try {
    const admission = await Admission.findByIdAndUpdate(
      id,
      { status, reviewNotes, reviewedBy: req.user._id },
      { new: true }
    );

    if (status === 'approved') {
      // Create student user logic here
      const studentData = {
        name: admission.studentName,
        email: admission.email,
        phone: admission.phone,
        role: 'student',
        school: admission.school,
        branch: admission.branch,
        class: admission.class,
        parentName: admission.parentName,
        parentPhone: admission.parentPhone,
        status: 'active'
      };
      await User.create(studentData);
    }

    res.json(admission);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Student Promotion System ---
export const promoteStudents = async (req, res) => {
  const { studentIds, fromClassId, toClassId, promotionType } = req.body;
  try {
    await User.updateMany(
      { _id: { $in: studentIds }, school: req.user.school },
      { $set: { class: toClassId } }
    );

    await PromotionHistory.create({
      school: req.user.school,
      branch: req.branchId,
      promotionType,
      fromClass: fromClassId,
      toClass: toClassId,
      studentIds,
      studentCount: studentIds.length,
      promotedBy: req.user._id
    });

    res.json({ message: 'Students promoted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Academic Calendar ---
export const getCalendarEvents = async (req, res) => {
  try {
    const events = await CalendarEvent.find({ school: req.user.school });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createCalendarEvent = async (req, res) => {
  try {
    const event = await CalendarEvent.create({
      ...req.body,
      school: req.user.school,
      branch: req.branchId,
      createdBy: req.user._id
    });
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Feature Usage Analytics ---
export const getUsageAnalytics = async (req, res) => {
  try {
    const school = await School.findById(req.user.school).populate('subscription.plan');
    const studentCount = await User.countDocuments({ school: req.user.school, role: 'student' });
    const teacherCount = await User.countDocuments({ school: req.user.school, role: 'teacher' });
    
    const limits = school.subscription.limits;
    const usage = {
      students: { used: studentCount, limit: limits.students, percent: (studentCount / limits.students) * 100 },
      teachers: { used: teacherCount, limit: limits.teachers, percent: (teacherCount / limits.teachers) * 100 },
      storage: { used: 0, limit: limits.storage, percent: 0 } // Storage calculation logic
    };

    res.json(usage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Support Ticket System ---
export const createSupportTicket = async (req, res) => {
  try {
    const ticketCount = await SupportTicket.countDocuments();
    const ticket = await SupportTicket.create({
      ...req.body,
      ticketId: `TKT-${ticketCount + 1000}`,
      school: req.user.school,
      user: req.user._id
    });
    res.status(201).json(ticket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSupportTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ school: req.user.school }).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Data Export Center ---
export const exportData = async (req, res) => {
  const { type, format } = req.query;
  try {
    let data;
    if (type === 'students') {
      data = await User.find({ school: req.user.school, role: 'student' }).populate('class');
    } else if (type === 'payments') {
      data = await MonthlyPayment.find({ school: req.user.school }).populate('student');
    }
    // Implementation for PDF/CSV/Excel export logic
    res.json({ message: 'Export logic triggered', type, format });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Student Profile Search ---
export const getStudentProfile = async (req, res) => {
  const { customId } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  try {
    // Search by ID or name
    const student = await User.findOne({ 
      $or: [
        { customId: customId },
        { name: { $regex: customId, $options: 'i' } }
      ],
      role: 'student', 
      school: schoolId 
    })
      .populate('class');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const academicMatch = { school: schoolId };
    if (req.branchId) academicMatch.branch = req.branchId;
    if (req.academicYearName) academicMatch.academicYear = req.academicYearName;

    const attendance = await Attendance.find({ 
      user: student._id,
      ...academicMatch
    }).populate('subject', 'name').sort({ date: -1 });
    
    const payments = await MonthlyPayment.find({ 
      student: student._id,
      ...academicMatch
    }).sort({ year: 1, createdAt: 1 });

    const discountHistory = await DiscountAssignment.find({
      school: schoolId,
      $or: [
        { scope: { $in: ['student', 'students'] }, students: student._id },
        ...(student.class?._id ? [{ scope: 'class', class: student.class._id }] : []),
        ...(student.class?.name ? [{ scope: 'grade', grade: student.class.name }] : []),
      ],
    })
      .populate('discount')
      .populate('assignedBy updatedBy removedBy', 'name email')
      .sort({ startDate: -1, createdAt: -1 });

    const activeDiscounts = await getActiveDiscountAssignmentsForStudent(student);

    const marks = await Mark.find({ 
      student: student._id,
      ...academicMatch
    }).populate('subject', 'name code').sort({ createdAt: -1 });

    // --- Academic Ranking Logic ---
    let academicHistory = null;
    if (student.class) {
      const classId = student.class._id;
      const classStudents = await User.find({ class: classId, role: 'student', school: schoolId });
      const assignments = await ClassSubject.find({ class: classId, school: schoolId }).populate('subject');
      const subjects = assignments.map((a) => a.subject).filter(Boolean);

      const allResults = await Promise.all(classStudents.map(async (cs) => {
        const studentMarks = await Mark.find({ student: cs._id, class: classId, school: schoolId });
        
        const m1 = studentMarks.reduce((sum, m) => sum + (m.monthly1 || 0), 0);
        const mid = studentMarks.reduce((sum, m) => sum + (m.midterm || 0), 0);
        const m2 = studentMarks.reduce((sum, m) => sum + (m.monthly2 || 0), 0);
        const fin = studentMarks.reduce((sum, m) => sum + (m.final || 0), 0);

        return {
          studentId: cs._id.toString(),
          m1: m1,
          mid: m1 + mid,
          m2: m1 + mid + m2,
          final: m1 + mid + m2 + fin
        };
      }));

      const stages = ['m1', 'mid', 'm2', 'final'];
      const myRanks = {};
      const myTotals = {};

      stages.forEach(stage => {
        allResults.sort((a, b) => b[stage] - a[stage]);
        let currentRank = 1;
        allResults.forEach((r, idx) => {
          if (idx > 0 && r[stage] < allResults[idx - 1][stage]) currentRank = idx + 1;
          if (r.studentId === student._id.toString()) {
            myRanks[stage] = currentRank;
            myTotals[stage] = r[stage];
          }
        });
      });

      // Subject-wise breakdown for the specific student
      const subjectBreakdown = subjects.map(sub => {
        const sm = marks.find(m => m.subject && m.subject._id.toString() === sub._id.toString());
        return {
          subjectName: sub.name,
          subjectCode: sub.code,
          m1: sm?.monthly1 || 0,
          mid: sm?.midterm || 0,
          m2: sm?.monthly2 || 0,
          final: sm?.final || 0,
          total: (sm?.monthly1 || 0) + (sm?.midterm || 0) + (sm?.monthly2 || 0) + (sm?.final || 0)
        };
      });

      academicHistory = {
        ranks: myRanks,
        totals: myTotals,
        subjects: subjectBreakdown,
        classSize: classStudents.length
      };
    }

    res.json({
      student,
      attendance,
      payments,
      activeDiscounts,
      discountHistory,
      marks,
      academicHistory
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Teacher Profile Search ---
export const getTeacherProfile = async (req, res) => {
  const { customId } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  try {
    // Search by ID or name
    const teacher = await User.findOne({ 
      $or: [
        { customId: customId },
        { name: { $regex: customId, $options: 'i' } }
      ],
      role: 'teacher', 
      school: schoolId 
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    res.json({ teacher });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Student Profile for Printing ---
export const getStudentProfileForPrint = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  try {
    const student = await User.findOne({ _id: id, role: 'student', school: schoolId })
      .populate('class', 'name section')
      .populate('school', 'name address phone email');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Get attendance summary
    const attendance = await Attendance.find({ 
      user: student._id,
      school: schoolId 
    }).sort({ date: -1 }).limit(30);

    const attendanceSummary = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'present').length,
      absent: attendance.filter(a => a.status === 'absent').length,
      late: attendance.filter(a => a.status === 'late').length
    };

    // Get recent marks
    const marks = await Mark.find({ 
      student: student._id,
      school: schoolId 
    })
      .populate('subject', 'name code')
      .populate('exam', 'name examDate')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      student,
      school: student.school,
      attendanceSummary,
      recentMarks: marks
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper function to generate unique ID
const generateUniqueId = async (role, schoolId) => {
  return await generateCustomId(role, schoolId);
};

// --- Student Management ---
export const createStudent = async (req, res) => {
  const schoolId = req.schoolId || req.user.school?._id || req.user.school;
  const branchId = await resolveBranchId(req);
  const academicYearId = req.academicYearId || (await getCurrentAcademicYear(schoolId))?._id;
  
  const { 
    name, 
    phone,
    age,
    monthlyFees,
    email, 
    password, 
    classId, 
    customId: providedCustomId,
    // Extended profile fields
    gender,
    placeOfBirth,
    address,
    motherName,
    parentName,
    parentPhone,
    emergencyContact,
    entryTime,
    studentMode,
    profileImage,
  } = req.body;
  
  try {
    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        message: 'Full name is required',
        userMessage: 'Full name is required.'
      });
    }
    
    // Validate name (allow common characters)
    if (!/^[A-Za-z\s.'-]+$/.test(name.trim())) {
      return res.status(400).json({ 
        message: 'Name contains invalid characters',
        userMessage: 'Name can only contain letters, spaces, dots, and hyphens.'
      });
    }
    
    // Validate phone (numbers only, if provided)
    if (phone && phone.trim()) {
      if (!/^[0-9+]+$/.test(phone.trim())) {
        return res.status(400).json({ 
          message: 'Phone number can only contain digits',
          userMessage: 'Phone number can only contain digits.'
        });
      }
    }
    
    // Validate age (numeric, 4-30)
    if (age !== undefined && age !== null && age !== '') {
      const ageNum = Number(age);
      if (isNaN(ageNum)) {
        return res.status(400).json({ 
          message: 'Age must be a number',
          userMessage: 'Age must be a valid number.'
        });
      }
      if (ageNum < 4 || ageNum > 30) {
        return res.status(400).json({ 
          message: 'Age must be between 4 and 30',
          userMessage: 'Age must be between 4 and 30 years.'
        });
      }
    }
    
    // Validate monthly fees (numeric, if provided)
    if (monthlyFees !== undefined && monthlyFees !== null && monthlyFees !== '') {
      const feesNum = Number(monthlyFees);
      if (isNaN(feesNum)) {
        return res.status(400).json({ 
          message: 'Monthly fees must be a number',
          userMessage: 'Monthly fees must be a valid number.'
        });
      }
      if (feesNum < 0) {
        return res.status(400).json({ 
          message: 'Monthly fees cannot be negative',
          userMessage: 'Monthly fees cannot be negative.'
        });
      }
    }
    
    // Validate class
    if (!classId) {
      return res.status(400).json({ 
        message: 'Class is required',
        userMessage: 'Please select a class for the student.'
      });
    }
    
    // Validate password
    if (!password || password.length < 8) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters',
        userMessage: 'Password must be at least 8 characters.'
      });
    }
    
    // Check if class exists
    const classExists = await Class.findOne({ _id: classId, school: schoolId });
    if (!classExists) {
      return res.status(400).json({ 
        message: 'Invalid class selected',
        userMessage: 'Selected class does not exist.'
      });
    }

    // Student ID logic
    let finalCustomId = providedCustomId?.trim();
    
    if (finalCustomId) {
      // Validate provided Student ID format (alphanumeric only)
      if (!/^[A-Za-z0-9]+$/.test(finalCustomId)) {
        return res.status(400).json({ 
          message: 'Student ID must contain only letters and numbers',
          userMessage: 'Student ID must contain only letters and numbers (no spaces or symbols).'
        });
      }
      
      // Check if Student ID already exists in this school
      const existingStudentId = await User.findOne({ customId: finalCustomId, school: schoolId });
      if (existingStudentId) {
        // If duplicate exists and it was provided by admin, return error
        // BUT the requirement says: "If duplicate exists: Generate a new unique ID automatically."
        // We'll follow the requirement and generate a new one if it conflicts.
        finalCustomId = await generateUniqueId('student', schoolId);
      }
    } else {
      // Auto-generate if not provided
      finalCustomId = await generateUniqueId('student', schoolId);
    }

    const user = await User.create({
      name: name.trim(),
      phone: phone ? phone.trim() : undefined,
      age: age !== undefined && age !== '' ? Number(age) : undefined,
      monthlyFees: monthlyFees !== undefined && monthlyFees !== '' ? Number(monthlyFees) : 0,
      email: email || undefined,
      customId: finalCustomId,
      password,
      role: 'student',
      school: schoolId,
      branch: branchId, // Ensure branch is assigned
      academicYear: req.academicYearId, // Ensure academic year ID is assigned
      class: classId,
      // Extended profile
      gender: gender || undefined,
      placeOfBirth: placeOfBirth?.trim() || undefined,
      address: address?.trim() || undefined,
      motherName: motherName?.trim() || undefined,
      parentName: parentName?.trim() || undefined,
      parentPhone: parentPhone?.trim() || undefined,
      emergencyContact: emergencyContact?.trim() || undefined,
      entryTime: entryTime?.trim() || undefined,
      studentMode: studentMode || 'Full-time',
      profileImage: (profileImage && typeof profileImage === 'object') ? profileImage : undefined,
    });
    
    logAction(req, {
      action: 'STUDENT_CREATED',
      module: 'STUDENTS',
      targetId: user._id,
      details: { customId: user.customId, name: user.name }
    });

    res.status(201).json(user);
  } catch (error) {
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Student ID already exists',
        userMessage: 'This Student ID already exists in this school. Please use a different ID.'
      });
    }
    res.status(400).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const getParents = async (req, res) => {
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const branchId = await resolveBranchId(req);

    const query = { 
      role: 'parent', 
      school: schoolId,
      deletedAt: { $exists: false }
    };
    if (branchId) query.branch = branchId;

    console.log(`[DEBUG] getParents: tenantId=${schoolId}, branchId=${branchId}`);

    const parents = await User.find(query)
      .populate({
        path: 'linkedStudents',
        select: 'name customId class',
        populate: { path: 'class', select: 'name section' }
      });
    res.json(parents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createParent = async (req, res) => {
  const { name, email, phone, customId, password } = req.body;
  const schoolId = req.user.school?._id || req.user.school;
  const branchId = await resolveBranchId(req);

  try {
    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Full name is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    // Check if parent already exists (email or customId)
    const orClause = [];
    if (email) orClause.push({ email: email.trim().toLowerCase() });
    if (customId) orClause.push({ customId: customId.trim() });

    if (orClause.length > 0) {
      const existingParent = await User.findOne({
        school: schoolId,
        $or: orClause,
        role: 'parent'
      });
      if (existingParent) {
        return res.status(400).json({ message: 'Parent with this email or ID already exists' });
      }
    }

    const parent = await User.create({
      name: name.trim(),
      email: email ? email.trim().toLowerCase() : undefined,
      phone: phone ? phone.trim() : undefined,
      customId: customId?.trim(),
      password,
      role: 'parent',
      school: schoolId,
      branch: branchId,
      status: 'active'
    });

    logAction(req, {
      action: 'PARENT_CREATED',
      module: 'PARENTS',
      targetId: parent._id,
      details: { name: parent.name, customId: parent.customId }
    });

    res.status(201).json(parent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateParent = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  const branchId = req.branchId;
  const { name, email, phone, customId, status, profileImage } = req.body;

  try {
    const query = {
      _id: id,
      role: 'parent',
      school: schoolId,
      deletedAt: { $exists: false }
    };
    if (branchId) query.branch = branchId;

    const parent = await User.findOne(query);
    if (!parent) {
      return res.status(404).json({
        message: 'Parent not found',
        userMessage: 'Parent not found in your school or branch.'
      });
    }

    if (name !== undefined) parent.name = name.trim();
    if (email !== undefined) parent.email = email ? email.trim().toLowerCase() : undefined;
    if (phone !== undefined) parent.phone = phone ? phone.trim() : undefined;
    if (customId !== undefined) parent.customId = customId ? customId.trim() : undefined;
    if (status !== undefined) parent.status = status;
    if (profileImage !== undefined) parent.profileImage = profileImage;

    await parent.save();

    logAction(req, {
      action: 'PARENT_UPDATED',
      module: 'PARENTS',
      targetId: parent._id,
      details: { name: parent.name, customId: parent.customId }
    });

    res.json(parent);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Parent email or ID already exists' });
    }
    res.status(400).json({ message: error.message });
  }
};

export const deleteParent = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  const branchId = req.branchId;

  try {
    const query = {
      _id: id,
      role: 'parent',
      school: schoolId,
      deletedAt: { $exists: false }
    };
    if (branchId) query.branch = branchId;

    const parent = await User.findOne(query);
    if (!parent) {
      return res.status(404).json({
        message: 'Parent not found',
        userMessage: 'Parent not found in your school or branch.'
      });
    }

    parent.deletedAt = new Date();
    parent.isDeleted = true;
    await parent.save();

    logAction(req, {
      action: 'PARENT_DELETED',
      module: 'PARENTS',
      targetId: parent._id,
      details: { name: parent.name, customId: parent.customId }
    });

    res.json({ message: 'Parent deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudents = async (req, res) => {
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const branchId = await resolveBranchId(req);
    const academicYearId = req.academicYearId || (await getCurrentAcademicYear(schoolId))?._id;

    const query = { 
      role: 'student', 
      school: schoolId,
      isDeleted: false
    };
    if (branchId) query.branch = branchId;
    // Removed strict academicYear filter to prevent missing older students
    // if (academicYearId) query.academicYear = academicYearId;

    console.log(`[DEBUG] getStudents: tenantId=${schoolId}, branchId=${branchId}`);

    const students = await User.find(query).populate('class').populate('branch', 'name');
    console.log(`[DEBUG] getStudents: Found ${students.length} students`);
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateStudent = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  const { 
    name, 
    phone, 
    age, 
    monthlyFees, 
    email, 
    classId, 
    customId,
    parentName,
    parentPhone,
    // Extended profile fields
    gender,
    placeOfBirth,
    address,
    motherName,
    emergencyContact,
    entryTime,
    studentMode,
    profileImage,
  } = req.body;
  
  try {
    const student = await User.findOne({ _id: id, role: 'student', school: schoolId });
    if (!student) {
      return res.status(404).json({ 
        message: 'Student not found',
        userMessage: 'Student not found.'
      });
    }

    // Update simple fields
    if (parentName !== undefined) student.parentName = parentName;
    if (parentPhone !== undefined) student.parentPhone = parentPhone;

    // Validate and update name
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ 
          message: 'Full name is required',
          userMessage: 'Full name is required.'
        });
      }
      // Allow letters, spaces, dots, and common name characters
      if (!/^[A-Za-z\s.'-]+$/.test(name.trim())) {
        return res.status(400).json({ 
          message: 'Name contains invalid characters',
          userMessage: 'Name can only contain letters, spaces, dots, and hyphens.'
        });
      }
      student.name = name.trim();
    }

    // Update phone
    if (phone !== undefined) {
      if (phone && phone.trim()) {
        if (!/^[0-9+]+$/.test(phone.trim())) {
          return res.status(400).json({ 
            message: 'Phone number can only contain digits',
            userMessage: 'Phone number can only contain digits.'
          });
        }
        student.phone = phone.trim();
      } else {
        student.phone = undefined;
      }
    }

    // Update age
    if (age !== undefined) {
      if (age !== null && age !== '') {
        const ageNum = Number(age);
        if (isNaN(ageNum)) {
          return res.status(400).json({ 
            message: 'Age must be a number',
            userMessage: 'Age must be a valid number.'
          });
        }
        if (ageNum < 4 || ageNum > 30) {
          return res.status(400).json({ 
            message: 'Age must be between 4 and 30',
            userMessage: 'Age must be between 4 and 30 years.'
          });
        }
        student.age = ageNum;
      } else {
        student.age = undefined;
      }
    }

    // Update monthly fees
    if (monthlyFees !== undefined) {
      if (monthlyFees !== null && monthlyFees !== '') {
        const feesNum = Number(monthlyFees);
        if (isNaN(feesNum)) {
          return res.status(400).json({ 
            message: 'Monthly fees must be a number',
            userMessage: 'Monthly fees must be a valid number.'
          });
        }
        if (feesNum < 0) {
          return res.status(400).json({ 
            message: 'Monthly fees cannot be negative',
            userMessage: 'Monthly fees cannot be negative.'
          });
        }
        student.monthlyFees = feesNum;
      } else {
        student.monthlyFees = 0;
      }
    }

    // Update email
    if (email !== undefined) {
      if (email === '') {
        student.email = undefined;
      } else if (email) {
        student.email = email.trim();
      }
    }

    // Update class
    if (classId !== undefined) {
      if (classId) {
        const classExists = await Class.findOne({ _id: classId, school: schoolId });
        if (!classExists) {
          return res.status(400).json({ 
            message: 'Invalid class selected',
            userMessage: 'Selected class does not exist.'
          });
        }
        student.class = classId;
      }
    }

    // Update custom ID
    if (customId !== undefined) {
      if (customId && customId.trim()) {
        // Check if new ID already exists in this school (excluding current student)
        const existingId = await User.findOne({ 
          customId: customId.trim(), 
          _id: { $ne: id },
          school: schoolId
        });
        if (existingId) {
          return res.status(400).json({ 
            message: 'Student ID already exists',
            userMessage: 'This Student ID already exists in this school. Please use a different ID.'
          });
        }
        student.customId = customId.trim();
      }
    }

    // Update extended profile fields
    if (gender !== undefined)           student.gender           = gender || undefined;
    if (placeOfBirth !== undefined)     student.placeOfBirth     = placeOfBirth?.trim() || undefined;
    if (address !== undefined)          student.address          = address?.trim() || undefined;
    if (motherName !== undefined)       student.motherName       = motherName?.trim() || undefined;
    if (emergencyContact !== undefined) student.emergencyContact = emergencyContact?.trim() || undefined;
    if (entryTime !== undefined)        student.entryTime        = entryTime?.trim() || undefined;
    if (studentMode !== undefined)      student.studentMode      = studentMode || 'Full-time';
    if (profileImage !== undefined)     student.profileImage     = (profileImage && typeof profileImage === 'object') ? profileImage : undefined;

    await student.save();
    res.json(student);
  } catch (error) {
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Student ID already exists',
        userMessage: 'This Student ID already exists. Please use a different ID.'
      });
    }
    res.status(400).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const deleteStudent = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  try {
    const student = await User.findOne({ _id: id, role: 'student', school: schoolId });
    if (!student) {
      return res.status(404).json({ 
        message: 'Student not found',
        userMessage: 'Student not found.'
      });
    }

    student.isDeleted = true;
    student.deletedAt = new Date();
    student.deletedBy = req.user._id;
    student.status = 'inactive';
    await student.save();

    res.json({ 
      message: 'Student archived successfully',
      userMessage: 'Student has been moved to archive.'
    });
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const restoreStudent = async (req, res) => {
  try {
    const student = await restoreRecord(User, req.params.id, req.user._id);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }
    student.status = 'active';
    await student.save();
    res.json({ message: 'Student restored successfully', student });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Transfer student to another class
export const transferStudent = async (req, res) => {
  const { studentId, newClassId } = req.body;
  const schoolId = req.user.school?._id || req.user.school;
  
  try {
    // Find the student
    const student = await User.findOne({ 
      _id: studentId, 
      role: 'student', 
      school: schoolId 
    });
    
    if (!student) {
      return res.status(404).json({ 
        message: 'Student not found',
        userMessage: 'Student not found.'
      });
    }
    
    // Verify the new class exists and belongs to the same school
    const newClass = await Class.findOne({ 
      _id: newClassId, 
      school: schoolId 
    });
    
    if (!newClass) {
      return res.status(400).json({ 
        message: 'Invalid class selected',
        userMessage: 'Selected class does not exist.'
      });
    }
    
    // Check if student is already in the target class
    if (student.class?.toString() === newClassId) {
      return res.status(400).json({ 
        message: 'Student is already in this class',
        userMessage: 'Student is already enrolled in this class.'
      });
    }
    
    // Get old class name for response
    let oldClassName = 'No Class';
    if (student.class) {
      const oldClass = await Class.findById(student.class);
      oldClassName = oldClass ? `${oldClass.name} - Section ${oldClass.section}` : 'Unknown Class';
    }
    
    // Update student's class
    student.class = newClassId;
    await student.save();
    
    res.json({ 
      message: 'Student transferred successfully',
      userMessage: `Student transferred from ${oldClassName} to ${newClass.name} - Section ${newClass.section}.`,
      student: {
        _id: student._id,
        name: student.name,
        customId: student.customId,
        newClass: {
          _id: newClass._id,
          name: newClass.name,
          section: newClass.section
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

// --- Attendance Management ---
export const getAllAttendance = async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  const branchId = req.branchId;
  try {
    const query = { school: schoolId };
    if (branchId) query.branch = branchId;

    console.log(`[DEBUG] getAllAttendance: tenantId=${schoolId}, branchId=${branchId}`);

    const attendance = await Attendance.find(query)
      .populate('user', 'name customId')
      .populate('class', 'name section')
      .populate('subject', 'name code')
      .populate('markedBy', 'name')
      .populate('branch', 'name')
      .sort({ date: -1 });
    console.log(`[DEBUG] getAllAttendance: Found ${attendance.length} records`);
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update attendance record
export const updateAttendance = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const schoolId = req.user.school?._id || req.user.school;
  
  try {
    const attendance = await Attendance.findOne({ _id: id, school: schoolId });
    if (!attendance) {
      return res.status(404).json({ 
        message: 'Attendance record not found',
        userMessage: 'Attendance record not found.'
      });
    }
    
    // Validate status
    const validStatuses = ['Present', 'Absent', 'Late', 'Excused'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: 'Invalid status',
        userMessage: 'Status must be Present, Absent, Late, or Excused.'
      });
    }
    
    attendance.status = status;
    attendance.markedBy = req.user._id; // Update who marked it
    await attendance.save();
    
    res.json({ 
      message: 'Attendance updated successfully',
      userMessage: 'Attendance updated successfully.',
      attendance
    });
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

// Delete attendance record
export const deleteAttendance = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  
  try {
    const attendance = await Attendance.findOne({ _id: id, school: schoolId });
    if (!attendance) {
      return res.status(404).json({ 
        message: 'Attendance record not found',
        userMessage: 'Attendance record not found.'
      });
    }
    
    await Attendance.deleteOne({ _id: id, school: schoolId });
    
    res.json({ 
      message: 'Attendance record deleted successfully',
      userMessage: 'Attendance record deleted successfully.'
    });
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

// --- Payment Management ---
export const getAllPayments = async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  const branchId = req.branchId;
  try {
    const query = { school: schoolId };
    if (branchId) query.branch = branchId;

    const payments = await Payment.find(query)
      .populate('student', 'name customId')
      .populate('branch', 'name')
      .sort({ date: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Exam & Marks Management ---
export const getAllExams = async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  const branchId = req.branchId;
  try {
    const query = { school: schoolId };
    if (branchId) query.branch = branchId;

    console.log(`[DEBUG] getAllExams: tenantId=${schoolId}, branchId=${branchId}`);

    const exams = await Exam.find(query)
      .populate('class', 'name section')
      .populate('subject', 'name code')
      .populate('branch', 'name')
      .sort({ date: -1 });
    console.log(`[DEBUG] getAllExams: Found ${exams.length} records`);
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createExam = async (req, res) => {
  const { name, term, date, classId, subjectId, maxMarks } = req.body;
  const schoolId = req.user.school?._id || req.user.school;
  try {
    // Resolve branch ID for the exam (defaulting to the class's branch if missing)
    let targetBranchId = req.branchId || req.user.branch;
    if (!targetBranchId) {
      const cls = await Class.findById(classId);
      targetBranchId = cls?.branch;
    }

    const exam = await Exam.create({
      name,
      term,
      date,
      class: classId,
      subject: subjectId,
      maxMarks,
      school: schoolId,
      branch: targetBranchId,
      academicYear: req.academicYearName,
    });
    res.status(201).json(exam);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const publishExam = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  try {
    const exam = await Exam.findOneAndUpdate(
      { _id: id, school: schoolId },
      { status: 'Published' },
      { new: true }
    );
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Notify Students and Parents
    const students = await User.find({ role: 'student', class: exam.class, school: schoolId });
    for (const student of students) {
      const title = '📊 Exam Results Published';
      const message = `Results for your exam "${exam.name}" have been published. You can now view them in your portal.`;
      
      await sendNotification({
        recipientId: student._id,
        schoolId,
        branchId: exam.branch || student.branch,
        title,
        message,
        type: 'exam'
      });

      // Parents
      const parents = await User.find({ role: 'parent', linkedStudents: student._id, school: schoolId });
      for (const parent of parents) {
        await sendNotification({
          recipientId: parent._id,
          schoolId,
          branchId: parent.branch,
          title: `📊 Exam Results Published: ${student.name}`,
          message: `Exam results for ${student.name} ("${exam.name}") have been published.`,
          type: 'exam'
        });
      }
    }

    res.json(exam);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getExamMarks = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  try {
    const exam = await Exam.findOne({ _id: id, school: schoolId })
        .populate('class')
        .populate('subject');
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const students = await User.find({
      role: 'student',
      class: exam.class._id,
      school: schoolId
    }).select('_id name customId').sort({ customId: 1 });

    const marks = await Mark.find({
      school: schoolId,
      class: exam.class._id,
      subject: exam.subject._id
    });

    const termToFieldMap = {
      'Monthly1': 'monthly1',
      'Midterm': 'midterm',
      'Monthly2': 'monthly2',
      'Final': 'final'
    };
    const targetField = termToFieldMap[exam.term];

    const studentMarks = students.map(student => {
      const studentMark = marks.find(m => m.student.toString() === student._id.toString());
      return {
        studentId: student._id,
        studentName: student.name,
        studentCustomId: student.customId,
        marks: studentMark && targetField ? studentMark[targetField] : '',
        remarks: studentMark ? studentMark.remarks : ''
      };
    });

    res.json({
      exam,
      marks: studentMarks
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateExamMarks = async (req, res) => {
  const { id } = req.params;
  const { studentMarks } = req.body;
  const schoolId = req.user.school?._id || req.user.school;
  
  try {
    const exam = await Exam.findOne({ _id: id, school: schoolId });
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const termToFieldMap = {
      'Monthly1': 'monthly1',
      'Midterm': 'midterm',
      'Monthly2': 'monthly2',
      'Final': 'final'
    };
    const targetField = termToFieldMap[exam.term];
    
    if (!targetField) {
      return res.status(400).json({ message: 'Invalid exam term' });
    }

    // Process all marks updates
    for (const item of studentMarks) {
      if (item.marks !== undefined && item.marks !== '') {
        const marksNum = Number(item.marks);
        if (!isNaN(marksNum)) {
          await Mark.findOneAndUpdate(
            {
              student: item.studentId,
              subject: exam.subject,
              class: exam.class,
              school: schoolId
            },
            {
              $set: {
                [targetField]: marksNum,
                remarks: item.remarks || '',
                gradedBy: req.user._id,
                school: schoolId,
                student: item.studentId,
                subject: exam.subject,
                class: exam.class
              }
            },
            { upsert: true, new: true }
          );
        }
      }
    }

    res.json({ message: 'Marks updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// --- Exam Session Management (New Horizontal Marks Entry) ---

export const createExamSession = async (req, res) => {
  const { name, date, maxMarks, classIds, subjectIds } = req.body;
  const schoolId = req.schoolId;
  const branchId = req.branchId;
  try {
    if (!name || !date || !maxMarks || !classIds || classIds.length === 0) {
      return res.status(400).json({
        message: 'All fields are required',
        userMessage: 'Please fill in all required fields and select at least one class.'
      });
    }

    let targetBranchId = branchId || req.user?.branch;
    if (!targetBranchId && classIds.length > 0) {
      const cls = await Class.findById(classIds[0]);
      targetBranchId = cls?.branch;
    }

    const examSession = await ExamSession.create({
      name,
      date: new Date(date),
      maxMarks: Number(maxMarks),
      classes: classIds,
      subjects: subjectIds || [],
      school: schoolId,
      branch: targetBranchId, // Automatic branch ownership
      status: 'Scheduled'
    });

    await examSession.populate('classes', 'name section');
    await examSession.populate('subjects', 'name code');

    res.status(201).json({
      message: 'Exam session created successfully',
      userMessage: 'Exam session created successfully.',
      examSession
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
      userMessage: 'Failed to create exam session. Please try again.'
    });
  }
};

export const getExamSessions = async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  try {
    const examSessions = await ExamSession.find({ school: schoolId })
      .populate('classes', 'name section')
      .populate('subjects', 'name code')
      .sort({ createdAt: -1 });
    res.json(examSessions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getExamSessionById = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  try {
    const examSession = await ExamSession.findOne({ _id: id, school: schoolId })
      .populate('classes', 'name section');
    if (!examSession) {
      return res.status(404).json({
        message: 'Exam session not found',
        userMessage: 'Exam session not found.'
      });
    }
    res.json(examSession);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get marks for a specific class in an exam session
export const getClassExamMarks = async (req, res) => {
  const { examSessionId, classId } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  try {
    // Get exam session with its subjects
    const examSession = await ExamSession.findOne({ _id: examSessionId, school: schoolId })
      .populate('subjects', 'name code');
    if (!examSession) {
      return res.status(404).json({
        message: 'Exam session not found',
        userMessage: 'Exam session not found.'
      });
    }

    // Get class details
    const classDetail = await Class.findOne({ _id: classId, school: schoolId });
    if (!classDetail) {
      return res.status(404).json({
        message: 'Class not found',
        userMessage: 'Class not found.'
      });
    }

    // Use subjects stored on the exam session; fall back to class subjects if none
    let subjects = examSession.subjects || [];
    if (!subjects.length) {
      const classSubjects = await ClassSubject.find({ class: classId, school: schoolId })
        .populate('subject', 'name code');
      subjects = classSubjects.map(cs => cs.subject);
    }

    // If requester is a teacher, verify they teach at least one subject in this class
    if (req.user.role === 'teacher') {
      const teacherAssignment = await ClassSubject.findOne({
        class: classId,
        teacher: req.user._id,
        school: schoolId,
      });
      if (!teacherAssignment) {
        return res.status(403).json({
          message: 'Access denied',
          userMessage: 'You are not assigned to teach any subject in this class.'
        });
      }
    }

    // Get students in this class
    const students = await User.find({
      role: 'student',
      class: classId,
      school: req.user.school
    }).select('_id name customId').sort({ customId: 1 });

    // Get existing marks for this exam session and class
    // We'll look for marks that are either linked to this exam session 
    // OR have scores in the field corresponding to this session's name
    const nameToFieldMap = {
      'Monthly 1': 'monthly1',
      'Midterm': 'midterm',
      'Monthly 2': 'monthly2',
      'Final': 'final'
    };
    const targetField = nameToFieldMap[examSession.name];

    const existingMarks = await Mark.find({
      school: req.user.school,
      class: classId,
      $or: [
        { exam: examSessionId },
        { [targetField]: { $gt: 0 } }
      ]
    }).populate('student', '_id').populate('subject', '_id');

    // Format response
    const marksData = students.map(student => {
      const studentMarks = {};
      subjects.forEach(subject => {
        const mark = existingMarks.find(m =>
          m.student._id.toString() === student._id.toString() &&
          m.subject._id.toString() === subject._id.toString()
        );

        const isSubmitted = mark ? (mark.exam?.toString() === examSessionId?.toString() || (targetField && mark[targetField] > 0)) : false;
        const displayMarks = mark ? (mark.exam?.toString() === examSessionId?.toString() ? mark.marks : mark[targetField]) : '';

        studentMarks[subject._id] = mark ? {
          markId: mark._id,
          marks: displayMarks,
          remarks: mark.remarks,
          isSubmitted: isSubmitted
        } : {
          markId: null,
          marks: '',
          remarks: '',
          isSubmitted: false
        };
      });

      return {
        studentId: student._id,
        studentName: student.name,
        studentCustomId: student.customId,
        marks: studentMarks
      };
    });

    res.json({
      examSession: {
        _id: examSession._id,
        name: examSession.name,
        date: examSession.date,
        maxMarks: examSession.maxMarks
      },
      class: {
        _id: classDetail._id,
        name: classDetail.name,
        section: classDetail.section
      },
      subjects,
      students: marksData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Submit or update marks for a student in a class exam
export const submitClassExamMarks = async (req, res) => {
  const { examSessionId, classId, studentId, subjectMarks } = req.body;
  // subjectMarks: [{ subjectId, marks, remarks }]

  try {
    const examSession = await ExamSession.findOne({ _id: examSessionId, school: req.user.school });
    if (!examSession) {
      return res.status(404).json({
        message: 'Exam session not found',
        userMessage: 'Exam session not found.'
      });
    }

    const maxMarks = examSession.maxMarks;
    const results = [];

    // If requester is a teacher, verify they are assigned to this class
    if (req.user.role === 'teacher') {
      const teacherInClass = await ClassSubject.findOne({
        class: classId,
        teacher: req.user._id,
        school: req.user.school,
      });
      if (!teacherInClass) {
        return res.status(403).json({
          message: 'Access denied',
          userMessage: 'You are not assigned to teach in this class.'
        });
      }
    }

    // Map exam session name to Mark model fields
    const nameToFieldMap = {
      'Monthly 1': 'monthly1',
      'Midterm': 'midterm',
      'Monthly 2': 'monthly2',
      'Final': 'final'
    };
    const targetField = nameToFieldMap[examSession.name];

    // Process each subject mark
    for (const { subjectId, marks, remarks } of subjectMarks) {
      // Validate marks do not exceed maxMarks
      const marksNum = Number(marks);
      if (isNaN(marksNum) || marksNum < 0 || marksNum > maxMarks) {
        return res.status(400).json({
          message: `Invalid marks. Must be between 0 and ${maxMarks}`,
          userMessage: `Marks must be between 0 and ${maxMarks}.`
        });
      }

      // If teacher, verify they are assigned to THIS specific subject in this class
      if (req.user.role === 'teacher') {
        const isAssigned = await ClassSubject.findOne({
          subject: subjectId,
          class: classId,
          teacher: req.user._id,
          school: req.user.school,
        });
        if (!isAssigned) {
          return res.status(403).json({
            message: 'Not authorized for this subject',
            userMessage: 'You can only enter marks for subjects you teach in this class.'
          });
        }
      }

      // Check if mark already exists
      let mark = await Mark.findOne({
        exam: examSessionId,
        student: studentId,
        subject: subjectId,
        class: classId,
        school: req.user.school
      });

      if (!mark) {
        // If not found by examSessionId, try finding by student/subject/class/school 
        // to see if we should update an existing record instead of creating a new one
        mark = await Mark.findOne({
          student: studentId,
          subject: subjectId,
          class: classId,
          school: req.user.school
        });
      }

      if (mark) {
        // Update existing mark
        mark.exam = examSessionId;
        mark.marks = marksNum;
        if (targetField) {
          mark[targetField] = marksNum;
        }
        mark.remarks = remarks || '';
        mark.gradedBy = req.user._id;
        await mark.save();
        results.push(mark);
      } else {
        // Create new mark
        const markData = {
          exam: examSessionId,
          student: studentId,
          subject: subjectId,
          class: classId,
          marks: marksNum,
          remarks: remarks || '',
          school: req.user.school,
          branch: req.branchId || req.user.branch || examSession.branch,
          gradedBy: req.user._id
        };
        if (targetField) {
          markData[targetField] = marksNum;
        }
        const newMark = await Mark.create(markData);
        results.push(newMark);
      }
    }

    res.json({
      message: 'Marks submitted successfully',
      userMessage: 'Marks submitted successfully.',
      results
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
      userMessage: 'Failed to submit marks. Please try again.'
    });
  }
};

// Delete marks for a student in a class exam
export const deleteClassExamMarks = async (req, res) => {
  const { examSessionId, classId, studentId, subjectId } = req.body;

  try {
    const result = await Mark.findOneAndDelete({
      exam: examSessionId,
      student: studentId,
      subject: subjectId,
      class: classId,
      school: req.user.school
    });

    if (!result) {
      return res.status(404).json({
        message: 'Mark not found',
        userMessage: 'Mark not found.'
      });
    }

    res.json({
      message: 'Mark deleted successfully',
      userMessage: 'Mark deleted successfully.'
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
      userMessage: 'Failed to delete mark. Please try again.'
    });
  }
};

export const getAllMarks = async (req, res) => {
  try {
    const marks = await Mark.find({ school: req.user.school })
      .populate('student', 'name customId')
      .populate({
        path: 'exam',
        populate: { path: 'subject', select: 'name' }
      })
      .sort({ createdAt: -1 });
    res.json(marks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// --- Teacher Management ---

/**
 * GET /admin/teachers/check-id?customId=XXX
 * Checks if a teacher ID is available (not already used)
 * Returns { available: boolean }
 */
export const checkTeacherId = async (req, res) => {
  const { customId, excludeId } = req.query;
  
  try {
    if (!customId || !customId.trim()) {
      return res.json({ available: false, message: 'Teacher ID is required' });
    }
    
    const normalizedId = customId.trim();
    
    // Validate format (alphanumeric only)
    if (!/^[A-Za-z0-9]+$/.test(normalizedId)) {
      return res.json({ available: false, message: 'Teacher ID can only contain letters and numbers' });
    }
    
    // Build query
    const query = { customId: normalizedId };
    
    // Exclude current teacher when editing
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    
    const existingTeacher = await User.findOne(query);
    
    res.json({ 
      available: !existingTeacher,
      message: existingTeacher ? 'This Teacher ID already exists.' : null
    });
  } catch (error) {
    res.status(500).json({ 
      available: false,
      message: 'Something went wrong. Please try again.'
    });
  }
};

export const createTeacher = async (req, res) => {
  const schoolId = req.schoolId || req.user.school?._id || req.user.school;
  const branchId = await resolveBranchId(req);
  const academicYearId = req.academicYearId || (await getCurrentAcademicYear(schoolId))?._id;

  const { 
    name, 
    email, 
    password, 
    customId: providedCustomId,
    phone,
    age,
    subjects,
    workingStartTime,
    workingEndTime,
    profileImage
  } = req.body;
  
  try {
    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        message: 'Full name is required',
        userMessage: 'Full name is required.'
      });
    }
    
    // Validate name contains only letters and spaces
    if (!/^[A-Za-z\s]+$/.test(name.trim())) {
      return res.status(400).json({ 
        message: 'Name can only contain letters',
        userMessage: 'Name can only contain letters (no numbers or symbols).'
      });
    }
    
    // Validate phone (required, numbers only)
    if (!phone || !phone.trim()) {
      return res.status(400).json({ 
        message: 'Phone number is required',
        userMessage: 'Phone number is required.'
      });
    }
    if (!/^[0-9+]+$/.test(phone.trim())) {
      return res.status(400).json({ 
        message: 'Phone number can only contain digits',
        userMessage: 'Phone number can only contain digits.'
      });
    }
    
    // Validate age (numeric, 18-70)
    if (age !== undefined && age !== null && age !== '') {
      const ageNum = Number(age);
      if (isNaN(ageNum)) {
        return res.status(400).json({ 
          message: 'Age must be a number',
          userMessage: 'Age must be a valid number.'
        });
      }
      if (ageNum < 18 || ageNum > 70) {
        return res.status(400).json({ 
          message: 'Teacher age must be between 18 and 70',
          userMessage: 'Age must be between 18 and 70 years.'
        });
      }
    }
    
    // Validate password
    if (!password || password.length < 8) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters',
        userMessage: 'Password must be at least 8 characters.'
      });
    }
    
    // Validate working times (required)
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    
    if (workingStartTime && !timeRegex.test(workingStartTime)) {
      return res.status(400).json({ 
        message: 'Invalid start time format',
        userMessage: 'Working start time must be in HH:MM format (e.g., 08:00).'
      });
    }
    
    if (workingEndTime && !timeRegex.test(workingEndTime)) {
      return res.status(400).json({ 
        message: 'Invalid end time format',
        userMessage: 'Working end time must be in HH:MM format (e.g., 14:00).'
      });
    }
    
    // Validate subjects (required)
    if (!subjects || subjects.length === 0) {
      return res.status(400).json({ 
        message: 'At least one subject is required',
        userMessage: 'Please select at least one subject.'
      });
    }
    const validSubjects = await Subject.find({
      _id: { $in: subjects },
      school: schoolId
    });
    
    if (validSubjects.length !== subjects.length) {
      return res.status(400).json({ 
        message: 'Invalid subject selected',
        userMessage: 'One or more selected subjects do not exist.'
      });
    }
    
    // Teacher ID logic
    let finalCustomId = providedCustomId?.trim();
    
    if (finalCustomId) {
      // Validate provided Teacher ID format (alphanumeric only)
      if (!/^[A-Za-z0-9]+$/.test(finalCustomId)) {
        return res.status(400).json({ 
          message: 'Teacher ID must contain only letters and numbers',
          userMessage: 'Teacher ID must contain only letters and numbers (no spaces or symbols).'
        });
      }
      
      // Check if Teacher ID already exists in this school
      const existingTeacherId = await User.findOne({ customId: finalCustomId, school: schoolId });
      if (existingTeacherId) {
        // If duplicate exists, follow requirement: Generate a new unique ID automatically.
        finalCustomId = await generateUniqueId('teacher', schoolId);
      }
    } else {
      // Auto-generate if not provided
      finalCustomId = await generateUniqueId('teacher', schoolId);
    }

    const user = await User.create({
      name: name.trim(),
      email: email || undefined,
      customId: finalCustomId,
      password,
      phone: phone ? phone.trim() : undefined,
      teacherAge: age !== undefined && age !== '' ? Number(age) : undefined,
      subjects: subjects && subjects.length > 0 ? subjects : [],
      workingStartTime: workingStartTime || undefined,
      workingEndTime: workingEndTime || undefined,
      profileImage: (profileImage && typeof profileImage === 'object') ? profileImage : undefined,
      role: 'teacher',
      school: schoolId,
      branch: branchId, // Ensure branch is assigned
      academicYear: academicYearId, // Ensure academic year is assigned
    });
    
    logAction(req, {
      action: 'TEACHER_CREATED',
      module: 'TEACHERS',
      targetId: user._id,
      details: { customId: user.customId, name: user.name }
    });

    // Populate subjects before returning
    const populatedUser = await User.findById(user._id).populate('subjects', 'name code');
    
    res.status(201).json(populatedUser);
  } catch (error) {
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Teacher ID already exists',
        userMessage: 'This Teacher ID already exists. Please use a different ID.'
      });
    }
    res.status(400).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const getTeachers = async (req, res) => {
  try {
    const branchId = await resolveBranchId(req);
    const query = { 
      role: 'teacher', 
      school: req.user.school,
      isDeleted: false
    };
    if (branchId) query.branch = branchId;

    console.log(`[DEBUG] getTeachers: tenantId=${req.user.school}, branchId=${branchId}`);

    const teachers = await User.find(query)
      .populate('subjects', 'name code')
      .populate('branch', 'name');
    console.log(`[DEBUG] getTeachers: Found ${teachers.length} teachers`);
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const getUsersForIDCard = async (req, res) => {
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const branchId = await resolveBranchId(req);

    // Get students, teachers, and staff (admin, accountant, branchmanager)
    const query = { 
      role: { $in: ['student', 'teacher', 'admin', 'accountant', 'branchmanager'] },
      school: schoolId,
      isDeleted: false
    };
    if (branchId) query.branch = branchId;

    console.log(`[DEBUG] getUsersForIDCard: tenantId=${schoolId}, branchId=${branchId}`);

    const users = await User.find(query)
      .populate('class', 'name section')
      .populate('branch', 'name')
      .populate('subjects', 'name code');
    
    console.log(`[DEBUG] getUsersForIDCard: Found ${users.length} users`);
    res.json(users);
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const updateTeacher = async (req, res) => {
  const { id } = req.params;
  const { 
    name, 
    email, 
    customId,
    phone,
    age,
    subjects,
    workingStartTime,
    workingEndTime,
    profileImage
  } = req.body;
  
  try {
    const teacher = await User.findOne({ _id: id, role: 'teacher', school: req.user.school });
    if (!teacher) {
      return res.status(404).json({ 
        message: 'Teacher not found',
        userMessage: 'Teacher not found.'
      });
    }

    // Validate and update name
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ 
          message: 'Full name is required',
          userMessage: 'Full name is required.'
        });
      }
      if (!/^[A-Za-z\s]+$/.test(name.trim())) {
        return res.status(400).json({ 
          message: 'Name can only contain letters',
          userMessage: 'Name can only contain letters (no numbers or symbols).'
        });
      }
      teacher.name = name.trim();
    }

    // Update email
    if (email !== undefined) {
      if (email === '') {
        teacher.email = undefined;
      } else if (email) {
        teacher.email = email.trim();
      }
    }

    // Update phone
    if (phone !== undefined) {
      if (phone && phone.trim()) {
        if (!/^[0-9+]+$/.test(phone.trim())) {
          return res.status(400).json({ 
            message: 'Phone number can only contain digits',
            userMessage: 'Phone number can only contain digits.'
          });
        }
        teacher.phone = phone.trim();
      } else {
        teacher.phone = undefined;
      }
    }

    // Update age
    if (age !== undefined) {
      if (age !== null && age !== '') {
        const ageNum = Number(age);
        if (isNaN(ageNum)) {
          return res.status(400).json({ 
            message: 'Age must be a number',
            userMessage: 'Age must be a valid number.'
          });
        }
        if (ageNum < 18 || ageNum > 70) {
          return res.status(400).json({ 
            message: 'Teacher age must be between 18 and 70',
            userMessage: 'Age must be between 18 and 70 years.'
          });
        }
        teacher.teacherAge = ageNum;
      } else {
        teacher.teacherAge = undefined;
      }
    }

    // Update subjects
    if (subjects !== undefined) {
      if (subjects && subjects.length > 0) {
        const validSubjects = await Subject.find({
          _id: { $in: subjects },
          school: req.user.school
        });
        
        if (validSubjects.length !== subjects.length) {
          return res.status(400).json({ 
            message: 'Invalid subject selected',
            userMessage: 'One or more selected subjects do not exist.'
          });
        }
        teacher.subjects = subjects;
      } else {
        teacher.subjects = [];
      }
    }

    // Update working times
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    
    if (workingStartTime !== undefined) {
      if (workingStartTime && !timeRegex.test(workingStartTime)) {
        return res.status(400).json({ 
          message: 'Invalid start time format',
          userMessage: 'Working start time must be in HH:MM format (e.g., 08:00).'
        });
      }
      teacher.workingStartTime = workingStartTime || undefined;
    }
    
    if (workingEndTime !== undefined) {
      if (workingEndTime && !timeRegex.test(workingEndTime)) {
        return res.status(400).json({ 
          message: 'Invalid end time format',
          userMessage: 'Working end time must be in HH:MM format (e.g., 14:00).'
        });
      }
      teacher.workingEndTime = workingEndTime || undefined;
    }

    // Update custom ID
    if (customId !== undefined) {
      if (customId && customId.trim()) {
        // Check if new ID already exists (excluding current teacher)
        const existingId = await User.findOne({ 
          customId: customId.trim(), 
          _id: { $ne: id } 
        });
        if (existingId) {
          return res.status(400).json({ 
            message: 'Teacher ID already exists',
            userMessage: 'This Teacher ID already exists. Please use a different ID.'
          });
        }
        teacher.customId = customId.trim();
      }
    }

    if (profileImage !== undefined)     teacher.profileImage     = (profileImage && typeof profileImage === 'object') ? profileImage : undefined;

    await teacher.save();
    
    // Populate subjects before returning
    const populatedTeacher = await User.findById(teacher._id).populate('subjects', 'name code');
    res.json(populatedTeacher);
  } catch (error) {
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Teacher ID already exists',
        userMessage: 'This Teacher ID already exists. Please use a different ID.'
      });
    }
    res.status(400).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const deleteTeacher = async (req, res) => {
  const { id } = req.params;
  try {
    const teacher = await User.findOne({ _id: id, role: 'teacher', school: req.user.school });
    if (!teacher) {
      return res.status(404).json({ 
        message: 'Teacher not found',
        userMessage: 'Teacher not found.'
      });
    }

    teacher.isDeleted = true;
    teacher.deletedAt = new Date();
    teacher.deletedBy = req.user._id;
    teacher.status = 'inactive';
    await teacher.save();

    res.json({ 
      message: 'Teacher archived successfully',
      userMessage: 'Teacher has been moved to archive.'
    });
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const restoreTeacher = async (req, res) => {
  try {
    const teacher = await restoreRecord(User, req.params.id, req.user._id);
    if (!teacher || teacher.role !== 'teacher') {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    teacher.status = 'active';
    await teacher.save();
    res.json({ message: 'Teacher restored successfully', teacher });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// --- Class Management ---
export const createClass = async (req, res) => {
  try {
    const classNameRaw = req.body.className ?? req.body.name;
    const sectionRaw = req.body.section;
    const maxStudentsRaw = req.body.maxStudents;

    const name = typeof classNameRaw === 'string' ? classNameRaw.trim() : '';
    const section = typeof sectionRaw === 'string' ? sectionRaw.trim().toUpperCase() : '';
    const maxStudents = Number(maxStudentsRaw);

    if (!name) return res.status(400).json({ message: 'Class name is required', userMessage: 'Class name is required.' });
    if (!section) return res.status(400).json({ message: 'Section is required', userMessage: 'Section is required.' });
    if (!Number.isFinite(maxStudents)) return res.status(400).json({ message: 'Max students must be a number', userMessage: 'Maximum students must be a valid number.' });
    if (!Number.isInteger(maxStudents)) return res.status(400).json({ message: 'Max students must be an integer', userMessage: 'Maximum students must be a whole number (no decimals).' });
    if (maxStudents <= 0) return res.status(400).json({ message: 'Max students must be greater than 0', userMessage: 'Maximum students must be greater than zero.' });

    const branchId = await resolveBranchId(req);
    const academicYearId = req.academicYearId || (await getCurrentAcademicYear(req.user.school))?._id;

    const exists = await Class.findOne({ school: req.user.school, name, section, branch: branchId });
    if (exists) {
      return res.status(400).json({ 
        message: 'Class with this name and section already exists',
        userMessage: 'A class with this name and section already exists. Please choose a different name or section.'
      });
    }

    const newClass = await Class.create({
      name,
      section,
      maxStudents,
      school: req.user.school,
      branch: branchId, // Ensure branch is assigned
      academicYear: academicYearId, // Ensure academic year ID is assigned
    });
    res.status(201).json(newClass);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateClass = async (req, res) => {
  const { id } = req.params;
  try {
    const { name, section, maxStudents } = req.body;
    
    const cls = await Class.findOne({ _id: id, school: req.user.school });
    if (!cls) {
      return res.status(404).json({ 
        message: 'Class not found',
        userMessage: 'Class not found.'
      });
    }
    
    // Update fields if provided
    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ 
          message: 'Class name is required',
          userMessage: 'Class name is required.'
        });
      }
      cls.name = trimmedName;
    }
    
    if (section !== undefined) {
      const trimmedSection = section.trim().toUpperCase();
      if (!trimmedSection) {
        return res.status(400).json({ 
          message: 'Section is required',
          userMessage: 'Section is required.'
        });
      }
      cls.section = trimmedSection;
    }
    
    if (maxStudents !== undefined) {
      const maxNum = Number(maxStudents);
      if (!Number.isFinite(maxNum) || !Number.isInteger(maxNum) || maxNum <= 0) {
        return res.status(400).json({ 
          message: 'Max students must be a positive integer',
          userMessage: 'Maximum students must be a positive number.'
        });
      }
      cls.maxStudents = maxNum;
    }
    
    // Check for duplicate if name or section changed
    const existingClass = await Class.findOne({
      school: req.user.school,
      name: cls.name,
      section: cls.section,
      _id: { $ne: id }
    });
    
    if (existingClass) {
      return res.status(400).json({ 
        message: 'Class with this name and section already exists',
        userMessage: 'A class with this name and section already exists.'
      });
    }
    
    await cls.save();
    res.json(cls);
  } catch (error) {
    res.status(400).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const deleteClass = async (req, res) => {
  const { id } = req.params;
  try {
    const cls = await Class.findOne({ _id: id, school: req.user.school });
    if (!cls) {
      return res.status(404).json({ 
        message: 'Class not found',
        userMessage: 'Class not found.'
      });
    }
    
    // Check if there are students in this class
    const studentsInClass = await User.countDocuments({ class: id, role: 'student' });
    if (studentsInClass > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete class with enrolled students',
        userMessage: `Cannot delete this class. ${studentsInClass} student(s) are still enrolled. Please transfer all students first.`
      });
    }
    
    // Soft delete related data
    const softDeleteData = { deletedAt: new Date(), deletedBy: req.user._id };
    
    await ClassSubject.updateMany({ class: id, school: req.user.school }, { $set: softDeleteData });
    await Schedule.updateMany({ class: id, school: req.user.school }, { $set: softDeleteData });
    
    cls.deletedAt = new Date();
    cls.deletedBy = req.user._id;
    await cls.save();
    
    res.json({ 
      message: 'Class archived successfully',
      userMessage: 'Class and its assignments have been archived.'
    });
  } catch (error) {
    res.status(400).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const getClassById = async (req, res) => {
  const { id } = req.params;
  try {
    const cls = await Class.findOne({ _id: id, school: req.user.school })
      .populate('classTeacher', 'name role');

    if (!cls) return res.status(404).json({ 
          message: 'Class not found',
          userMessage: 'The class you are looking for could not be found.'
        });

    const assignments = await ClassSubject.find({ class: cls._id, school: req.user.school })
      .populate('subject', 'name code')
      .populate('teacher', 'name role');

    const subjects = assignments.map((a) => ({
      _id: a.subject?._id,
      assignmentId: a._id,
      name: a.subject?.name,
      code: a.subject?.code,
      teacher: a.teacher,
    }));

    res.json({ ...cls.toObject(), subjects });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getClasses = async (req, res) => {
  try {
    const query = { 
      school: req.user.school,
      deletedAt: { $exists: false }
    };
    
    // Only filter by branch if req.branchId is set
    if (req.branchId) {
      query.branch = req.branchId;
    }
    
    // Removing strict academic year filter for classes to ensure older classes still load
    // if (req.academicYearId) {
    //   query.academicYear = req.academicYearId;
    // }

    console.log(`[DEBUG] getClasses: tenantId=${req.user.school}, branchId=${req.branchId}`);

    const classes = await Class.find(query)
      .populate('classTeacher')
      .populate('branch', 'name')
      .lean();
    console.log(`[DEBUG] getClasses: Found ${classes.length} classes`);

    const classIds = classes.map((c) => c._id);
    const countQuery = { school: req.user.school, class: { $in: classIds }, deletedAt: { $exists: false } };
    if (req.branchId) countQuery.branch = req.branchId;

    const counts = await ClassSubject.aggregate([
      { $match: countQuery },
      { $group: { _id: '$class', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((x) => [String(x._id), x.count]));

    const withCounts = classes.map((c) => ({
      ...c,
      assignedSubjectCount: countMap[String(c._id)] || 0,
    }));

    res.json(withCounts);
  } catch (error) {
    console.error('[getClasses] error:', error);
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Failed to load classes.'
    });
  }
};

// --- Subject Management (global catalog: name + code only) ---

/**
 * GET /admin/subjects/check-code?code=XXX
 * Checks if a subject code is available (not already used)
 * Returns { available: boolean }
 */
export const checkSubjectCode = async (req, res) => {
  const { code, excludeId } = req.query;
  
  try {
    if (!code || !code.trim()) {
      return res.json({ available: false, message: 'Code is required' });
    }
    
    const normalizedCode = code.toUpperCase().trim();
    
    // Validate format
    if (!/^[A-Z0-9]+$/.test(normalizedCode)) {
      return res.json({ available: false, message: 'Invalid code format' });
    }
    
    // Build query
    const query = { 
      school: req.user.school, 
      code: normalizedCode 
    };
    
    // Exclude current subject when editing
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    
    const existingSubject = await Subject.findOne(query);
    
    res.json({ 
      available: !existingSubject,
      message: existingSubject ? 'This subject code already exists.' : null
    });
  } catch (error) {
    res.status(500).json({ 
      available: false,
      message: 'Something went wrong. Please try again.'
    });
  }
};

export const createSubject = async (req, res) => {
  const { name, code } = req.body;
  try {
    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        message: 'Subject name is required',
        userMessage: 'Subject name is required.'
      });
    }
    
    if (!code || !code.trim()) {
      return res.status(400).json({ 
        message: 'Subject code is required',
        userMessage: 'Subject code is required.'
      });
    }
    
    // Normalize code to uppercase and validate format
    const normalizedCode = code.toUpperCase().trim();
    
    if (!/^[A-Z0-9]+$/.test(normalizedCode)) {
      return res.status(400).json({ 
        message: 'Subject code may only contain letters and numbers',
        userMessage: 'Subject code may only contain letters and numbers (no spaces or symbols).'
      });
    }
    
    // Resolve branch and academic year automatically
    const branchId = await resolveBranchId(req);
    const academicYearId = req.academicYearId || (await getCurrentAcademicYear(req.user.school))?._id;
    
    // Check for duplicate code (case-insensitive)
    const existingSubject = await Subject.findOne({ 
      school: req.user.school, 
      code: normalizedCode,
      branch: branchId 
    });
    
    if (existingSubject) {
      return res.status(400).json({ 
        message: 'Subject code already exists',
        userMessage: 'This subject code already exists.'
      });
    }
    
    const subject = await Subject.create({
      name: name.trim(),
      code: normalizedCode,
      school: req.user.school,
      branch: branchId, // Ensure branch is assigned
      academicYear: academicYearId, // Ensure academic year ID is assigned
    });
    
    res.status(201).json(subject);
  } catch (error) {
    // Handle MongoDB duplicate key error (in case of race condition)
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Subject code already exists',
        userMessage: 'This subject code already exists.'
      });
    }
    res.status(400).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const getSubjects = async (req, res) => {
  try {
    const branchId = await resolveBranchId(req);
    const query = { school: req.user.school };
    if (branchId) query.branch = branchId;
    
    console.log(`[DEBUG] getSubjects: tenantId=${req.user.school}, branchId=${branchId}`);

    const subjects = await Subject.find(query)
      .populate('branch', 'name')
      .sort({ name: 1 });
    console.log(`[DEBUG] getSubjects: Found ${subjects.length} subjects`);
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const updateSubject = async (req, res) => {
  const { id } = req.params;
  const { name, code } = req.body;
  try {
    const subject = await Subject.findOne({ _id: id, school: req.user.school });
    if (!subject) {
      return res.status(404).json({ 
        message: 'Subject not found',
        userMessage: 'Subject not found.'
      });
    }

    // Validate and update name
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ 
          message: 'Subject name is required',
          userMessage: 'Subject name is required.'
        });
      }
      subject.name = name.trim();
    }
    
    // Validate and update code
    if (code !== undefined) {
      const normalizedCode = code.toUpperCase().trim();
      
      if (!normalizedCode) {
        return res.status(400).json({ 
          message: 'Subject code is required',
          userMessage: 'Subject code is required.'
        });
      }
      
      if (!/^[A-Z0-9]+$/.test(normalizedCode)) {
        return res.status(400).json({ 
          message: 'Subject code may only contain letters and numbers',
          userMessage: 'Subject code may only contain letters and numbers (no spaces or symbols).'
        });
      }
      
      // Check for duplicate code (excluding current subject)
      const existingSubject = await Subject.findOne({ 
        school: req.user.school, 
        code: normalizedCode,
        _id: { $ne: id }
      });
      
      if (existingSubject) {
        return res.status(400).json({ 
          message: 'Subject code already exists',
          userMessage: 'This subject code already exists.'
        });
      }
      
      subject.code = normalizedCode;
    }

    await subject.save();
    res.json(subject);
  } catch (error) {
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Subject code already exists',
        userMessage: 'This subject code already exists.'
      });
    }
    res.status(400).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

export const deleteSubject = async (req, res) => {
  const { id } = req.params;
  try {
    const subject = await Subject.findOne({ _id: id, school: req.user.school });
    if (!subject) {
      return res.status(404).json({ 
        message: 'Subject not found',
        userMessage: 'Subject not found.'
      });
    }

    // Soft delete related data
    const softDeleteData = { deletedAt: new Date(), deletedBy: req.user._id };
    
    await ClassSubject.updateMany({ subject: id, school: req.user.school }, { $set: softDeleteData });
    
    subject.deletedAt = new Date();
    subject.deletedBy = req.user._id;
    await subject.save();

    res.json({ 
      message: 'Subject archived successfully',
      userMessage: 'Subject and its class assignments have been archived.'
    });
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

// --- Fee Structure & Discount Management ---
export const createFeeStructure = async (req, res) => {
  try {
    const fee = await FeeStructure.create({
      ...req.body,
      school: req.user.school,
      branch: req.branchId,
      academicYear: req.academicYearId
    });
    res.status(201).json(fee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getFeeStructures = async (req, res) => {
  try {
    const fees = await FeeStructure.find({ school: req.user.school, branch: req.branchId }).populate('classFees.class');
    res.json(fees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const calculateStudentFee = async (req, res) => {
  const { studentId, feeStructureId, discountIds = [] } = req.body;
  try {
    const student = await User.findOne({ _id: studentId, school: req.user.school, role: 'student' }).populate('class');
    const fee = await FeeStructure.findOne({ _id: feeStructureId, school: req.user.school });

    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (!fee) return res.status(404).json({ message: 'Fee structure not found' });

    let baseAmount = fee.baseAmount;
    if (fee.type === 'class_based') {
      const classFee = fee.classFees.find(cf => cf.class.toString() === student.class._id.toString());
      if (classFee) baseAmount = classFee.amount;
    }

    let calculation;
    if (discountIds.length) {
      const discounts = await Discount.find({ _id: { $in: discountIds }, school: req.user.school, isActive: true });
      calculation = calculateDiscountedAmount(
        baseAmount,
        discounts.map((discount) => ({ _id: discount._id, discount }))
      );
    } else {
      calculation = await calculateStudentMonthlyFee(student, baseAmount);
    }

    res.json({
      originalFee: calculation.originalAmount,
      discount: calculation.discountAmount,
      finalAmount: calculation.finalAmount,
      appliedDiscounts: calculation.appliedDiscounts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Approval Workflow ---
export const requestApproval = async (req, res) => {
  try {
    const request = await ApprovalRequest.create({
      ...req.body,
      school: req.user.school,
      branch: req.branchId,
      requestedBy: req.user._id
    });
    res.status(201).json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const handleApproval = async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;
  try {
    const request = await ApprovalRequest.findById(id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    request.status = status;
    request.approvedBy = req.user._id;
    request.approvedAt = new Date();
    if (status === 'rejected') request.rejectionReason = rejectionReason;

    await request.save();

    // Trigger secondary logic if approved (e.g. transfer student)
    if (status === 'approved') {
      if (request.type === 'student_transfer') {
        await User.findByIdAndUpdate(request.targetId, { 
          branch: request.data.toBranchId,
          class: request.data.toClassId 
        });
      }
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Asset Management ---
export const getAssets = async (req, res) => {
  try {
    const assets = await Asset.find({ school: req.user.school, branch: req.branchId }).populate('assignedTo', 'name');
    res.json(assets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createAsset = async (req, res) => {
  try {
    const asset = await Asset.create({
      ...req.body,
      school: req.user.school,
      branch: req.branchId
    });
    res.status(201).json(asset);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Discounts Management ---
export const getDiscounts = async (req, res) => {
  try {
    const query = { school: req.user.school };
    if (req.branchId) query.$or = [{ branch: req.branchId }, { branch: { $exists: false } }, { branch: null }];
    const discounts = await Discount.find(query)
      .populate('createdBy updatedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(discounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createDiscount = async (req, res) => {
  try {
    const value = Number(req.body.value);
    if (!req.body.name?.trim()) return res.status(400).json({ message: 'Discount name is required' });
    if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ message: 'Discount value must be greater than zero' });
    if (req.body.valueType === 'percentage' && value > 100) return res.status(400).json({ message: 'Percentage discount cannot exceed 100%' });

    const discount = await Discount.create({
      ...req.body,
      name: req.body.name.trim(),
      value,
      school: req.user.school,
      branch: req.branchId,
      code: req.body.code?.trim()?.toUpperCase(),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    logFinanceAction(req, {
      action: 'DISCOUNT_CREATE',
      targetId: discount._id,
      newValue: discount.toObject(),
      metadata: { discountName: discount.name },
    });

    res.status(201).json(discount);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateDiscount = async (req, res) => {
  try {
    const discount = await Discount.findOne({ _id: req.params.id, school: req.user.school });
    if (!discount) return res.status(404).json({ message: 'Discount not found' });

    const oldValue = discount.toObject();
    const allowed = ['name', 'type', 'valueType', 'value', 'code', 'description', 'isActive'];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) discount[field] = req.body[field];
    });
    if (discount.name) discount.name = discount.name.trim();
    if (discount.code) discount.code = discount.code.trim().toUpperCase();
    if (discount.value !== undefined) {
      discount.value = Number(discount.value);
      if (!Number.isFinite(discount.value) || discount.value <= 0) {
        return res.status(400).json({ message: 'Discount value must be greater than zero' });
      }
      if (discount.valueType === 'percentage' && discount.value > 100) {
        return res.status(400).json({ message: 'Percentage discount cannot exceed 100%' });
      }
    }
    discount.updatedBy = req.user._id;
    await discount.save();

    logFinanceAction(req, {
      action: 'DISCOUNT_UPDATE',
      targetId: discount._id,
      oldValue,
      newValue: discount.toObject(),
      metadata: { discountName: discount.name },
    });

    res.json(discount);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDiscountAssignments = async (req, res) => {
  try {
    const query = { school: req.user.school };
    if (req.branchId) query.$or = [{ branch: req.branchId }, { branch: { $exists: false } }, { branch: null }];
    if (req.query.studentId) query.students = req.query.studentId;
    if (req.query.discountId) query.discount = req.query.discountId;
    if (req.query.active === 'true') query.isActive = true;
    if (req.query.active === 'false') query.isActive = false;

    const assignments = await DiscountAssignment.find(query)
      .populate('discount')
      .populate('students', 'name customId')
      .populate('class', 'name section')
      .populate('assignedBy updatedBy removedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const assignDiscount = async (req, res) => {
  try {
    const {
      discountId,
      scope,
      studentId,
      studentIds = [],
      classId,
      grade,
      duration = 'permanent',
      startDate,
      endDate,
      reason,
    } = req.body;

    const discount = await Discount.findOne({ _id: discountId, school: req.user.school, isActive: true });
    if (!discount) return res.status(404).json({ message: 'Active discount not found' });
    if (!['student', 'students', 'class', 'grade'].includes(scope)) {
      return res.status(400).json({ message: 'Invalid discount assignment scope' });
    }

    const assignmentStudents = scope === 'student'
      ? [studentId].filter(Boolean)
      : scope === 'students'
        ? studentIds.filter(Boolean)
        : [];

    if ((scope === 'student' || scope === 'students') && assignmentStudents.length === 0) {
      return res.status(400).json({ message: 'Select at least one student' });
    }
    if (scope === 'class' && !classId) return res.status(400).json({ message: 'Class is required' });
    if (scope === 'grade' && !grade?.trim()) return res.status(400).json({ message: 'Grade is required' });

    if (assignmentStudents.length) {
      const studentCount = await User.countDocuments({
        _id: { $in: assignmentStudents },
        school: req.user.school,
        role: 'student',
      });
      if (studentCount !== assignmentStudents.length) {
        return res.status(400).json({ message: 'One or more selected students are invalid' });
      }
    }

    if (scope === 'class') {
      const classExists = await Class.exists({ _id: classId, school: req.user.school });
      if (!classExists) return res.status(400).json({ message: 'Selected class is invalid' });
    }

    const startsAt = startDate ? new Date(startDate) : new Date();
    const endsAt = resolveDiscountEndDate(duration, startsAt, endDate);
    if (endsAt && endsAt < startsAt) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    const assignment = await DiscountAssignment.create({
      school: req.user.school,
      branch: req.branchId,
      discount: discount._id,
      discountSnapshot: {
        name: discount.name,
        type: discount.type,
        valueType: discount.valueType,
        value: discount.value,
        code: discount.code,
      },
      scope,
      students: assignmentStudents,
      class: scope === 'class' ? classId : undefined,
      grade: scope === 'grade' ? grade.trim() : undefined,
      duration,
      startDate: startsAt,
      endDate: endsAt,
      reason,
      assignedBy: req.user._id,
      updatedBy: req.user._id,
    });

    logFinanceAction(req, {
      action: 'DISCOUNT_ASSIGN',
      targetId: assignment._id,
      newValue: assignment.toObject(),
      metadata: { discountName: discount.name, scope },
    });

    const populated = await DiscountAssignment.findById(assignment._id)
      .populate('discount')
      .populate('students', 'name customId')
      .populate('class', 'name section')
      .populate('assignedBy', 'name email');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateDiscountAssignment = async (req, res) => {
  try {
    const assignment = await DiscountAssignment.findOne({ _id: req.params.id, school: req.user.school });
    if (!assignment) return res.status(404).json({ message: 'Discount assignment not found' });

    const oldValue = assignment.toObject();
    const allowed = ['duration', 'startDate', 'endDate', 'reason', 'isActive'];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) assignment[field] = req.body[field];
    });
    if (req.body.duration || req.body.startDate || req.body.endDate !== undefined) {
      assignment.endDate = resolveDiscountEndDate(
        assignment.duration,
        assignment.startDate,
        req.body.endDate
      );
    }
    assignment.updatedBy = req.user._id;
    await assignment.save();

    logFinanceAction(req, {
      action: 'DISCOUNT_ASSIGNMENT_UPDATE',
      targetId: assignment._id,
      oldValue,
      newValue: assignment.toObject(),
    });

    res.json(assignment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const removeDiscountAssignment = async (req, res) => {
  try {
    const assignment = await DiscountAssignment.findOne({ _id: req.params.id, school: req.user.school });
    if (!assignment) return res.status(404).json({ message: 'Discount assignment not found' });

    const oldValue = assignment.toObject();
    assignment.isActive = false;
    assignment.removedAt = new Date();
    assignment.removedBy = req.user._id;
    assignment.updatedBy = req.user._id;
    await assignment.save();

    logFinanceAction(req, {
      action: 'DISCOUNT_REMOVE',
      targetId: assignment._id,
      oldValue,
      newValue: assignment.toObject(),
    });

    res.json({ message: 'Discount assignment removed', assignment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDiscountReports = async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;
    const school = req.user.school;

    const paymentFilter = { school };
    if (req.branchId) paymentFilter.branch = req.branchId;
    if (startDate || endDate) {
      paymentFilter.createdAt = {};
      if (startDate) paymentFilter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        paymentFilter.createdAt.$lte = end;
      }
    }

    const assignmentFilter = { school };
    if (req.branchId) assignmentFilter.$or = [{ branch: req.branchId }, { branch: { $exists: false } }, { branch: null }];
    if (type) assignmentFilter['discountSnapshot.type'] = type;

    const [payments, assignments] = await Promise.all([
      MonthlyPayment.find(paymentFilter).populate('student', 'name customId').populate('class', 'name section'),
      DiscountAssignment.find(assignmentFilter).populate('discount').populate('students', 'name customId').populate('class', 'name section'),
    ]);

    const discountedPayments = payments.filter((p) => Number(p.discountAmount || 0) > 0);
    const totalOriginal = payments.reduce((sum, p) => sum + Number(p.originalAmount || p.amount || 0), 0);
    const totalDiscount = payments.reduce((sum, p) => sum + Number(p.discountAmount || 0), 0);
    const netRevenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const outstandingAfterDiscount = payments
      .filter((p) => p.status === 'UNPAID')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const byType = {};
    discountedPayments.forEach((payment) => {
      payment.appliedDiscounts.forEach((discount) => {
        const key = discount.type || 'custom';
        byType[key] ||= { type: key, count: 0, amount: 0 };
        byType[key].count += 1;
        byType[key].amount += Number(discount.amount || 0);
      });
    });

    const scholarshipTypes = ['scholarship', 'merit', 'financial_aid'];
    const scholarshipPayments = discountedPayments.filter((payment) =>
      payment.appliedDiscounts.some((discount) => scholarshipTypes.includes(discount.type))
    );

    res.json({
      summary: {
        totalOriginal,
        totalDiscount,
        netRevenue,
        outstandingAfterDiscount,
        discountedInvoiceCount: discountedPayments.length,
        activeAssignmentCount: assignments.filter((a) => a.isActive).length,
      },
      discountReport: {
        byType: Object.values(byType),
        assignments,
        payments: discountedPayments,
      },
      scholarshipReport: {
        totalAmount: scholarshipPayments.reduce((sum, p) => sum + Number(p.discountAmount || 0), 0),
        count: scholarshipPayments.length,
        payments: scholarshipPayments,
      },
      revenueImpactReport: {
        grossRevenue: totalOriginal,
        discountImpact: totalDiscount,
        netRevenue,
        outstandingAfterDiscount,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Library Management ---
export const getLibraryBooks = async (req, res) => {
  try {
    const books = await LibraryBook.find({ school: req.user.school, branch: req.branchId }).sort({ createdAt: -1 });
    res.json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createLibraryBook = async (req, res) => {
  try {
    const book = await LibraryBook.create({
      ...req.body,
      school: req.user.school,
      branch: req.branchId,
      availableQuantity: req.body.availableQuantity ?? req.body.quantity ?? 1,
      createdBy: req.user._id
    });
    res.status(201).json(book);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const issueLibraryBook = async (req, res) => {
  try {
    const { bookId, userId, dueDate, remarks } = req.body;
    const book = await LibraryBook.findOne({ _id: bookId, school: req.user.school, branch: req.branchId });

    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    if ((book.availableQuantity || 0) <= 0) {
      return res.status(400).json({ message: 'No copies available for issue' });
    }

    book.availableQuantity = Math.max(0, (book.availableQuantity || 0) - 1);
    await book.save();

    const issue = await LibraryIssue.create({
      school: req.user.school,
      branch: req.branchId,
      book: bookId,
      user: userId,
      dueDate,
      remarks,
      createdBy: req.user._id
    });

    res.status(201).json(issue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const returnLibraryBook = async (req, res) => {
  try {
    const { id } = req.params;
    const issue = await LibraryIssue.findById(id).populate('book');

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    issue.status = 'Returned';
    issue.returnDate = new Date();
    issue.updatedBy = req.user._id;
    await issue.save();

    if (issue.book) {
      await LibraryBook.findByIdAndUpdate(issue.book._id, {
        $inc: { availableQuantity: 1 }
      });
    }

    res.json(issue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Transport Management ---
export const getTransportRoutes = async (req, res) => {
  try {
    const routes = await TransportRoute.find({ school: req.user.school, branch: req.branchId }).sort({ createdAt: -1 });
    res.json(routes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createTransportRoute = async (req, res) => {
  try {
    const route = await TransportRoute.create({
      ...req.body,
      school: req.user.school,
      branch: req.branchId,
      createdBy: req.user._id
    });
    res.status(201).json(route);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getTransportVehicles = async (req, res) => {
  try {
    const vehicles = await TransportVehicle.find({ school: req.user.school, branch: req.branchId }).sort({ createdAt: -1 });
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createTransportVehicle = async (req, res) => {
  try {
    const vehicle = await TransportVehicle.create({
      ...req.body,
      school: req.user.school,
      branch: req.branchId,
      createdBy: req.user._id
    });
    res.status(201).json(vehicle);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Security & Session Management ---
export const getActiveSessions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('activeSessions loginHistory');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const revokeSession = async (req, res) => {
  const { sessionId } = req.params;
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { activeSessions: { sessionId } }
    });
    res.json({ message: 'Session revoked' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** POST /admin/classes/:classId/subjects  body: { subjectId, teacherId } */
export const assignSubjectToClass = async (req, res) => {
  const { classId } = req.params;
  const { subjectId, teacherId } = req.body;

  try {
    if (!teacherId) {
      return res.status(400).json({ message: 'Teacher is required' });
    }

    const cls = await Class.findOne({ _id: classId, school: req.user.school });
    const sub = await Subject.findOne({ _id: subjectId, school: req.user.school });
    if (!cls || !sub) {
      return res.status(404).json({ message: 'Class or subject not found' });
    }

    const teacherOk = await User.exists({ _id: teacherId, role: 'teacher', school: req.user.school });
    if (!teacherOk) {
      return res.status(400).json({ message: 'Invalid teacher for this school' });
    }

    const row = await ClassSubject.findOneAndUpdate(
      { class: classId, subject: subjectId, school: req.user.school },
      { $set: { class: classId, subject: subjectId, school: req.user.school, teacher: teacherId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const populated = await ClassSubject.findById(row._id)
      .populate('subject', 'name code')
      .populate('teacher', 'name role');

    res.status(200).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateClassSubjectAssignment = async (req, res) => {
  const { id } = req.params;
  const { teacherId } = req.body;
  try {
    if (!teacherId) {
      return res.status(400).json({ message: 'Teacher is required' });
    }

    const teacherOk = await User.exists({ _id: teacherId, role: 'teacher', school: req.user.school });
    if (!teacherOk) {
      return res.status(400).json({ message: 'Invalid teacher for this school' });
    }

    const row = await ClassSubject.findOneAndUpdate(
      { _id: id, school: req.user.school },
      { $set: { teacher: teacherId } },
      { new: true }
    )
      .populate('subject', 'name code')
      .populate('teacher', 'name role');

    if (!row) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    res.json(row);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const removeClassSubjectAssignment = async (req, res) => {
  const { id } = req.params;
  try {
    const row = await ClassSubject.findOneAndDelete({ _id: id, school: req.user.school });
    if (!row) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    res.json({ message: 'Subject removed from class' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Dashboard Statistics ---
export const getDashboardStats = async (req, res) => {
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const branchId = req.branchId; // From branchIsolation middleware
    const academicYearId = req.academicYearId; // From injectAcademicYear middleware
    
    if (!schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }

    const query = { school: schoolId };
    if (branchId) query.branch = branchId;
    if (academicYearId) query.academicYear = academicYearId;

    const totalStudents = await User.countDocuments({ role: 'student', ...query });
    const totalTeachers = await User.countDocuments({ role: 'teacher', ...query });
    const totalClasses = await Class.countDocuments(query);

    // Attendance rate (last 30 days)
    const now = new Date();
    const start30Days = new Date(now);
    start30Days.setDate(start30Days.getDate() - 30);
    
    const attendanceMatch = { school: schoolId, date: { $gte: start30Days, $lte: now } };
    if (branchId) attendanceMatch.branch = branchId;

    const attendanceAgg = await Attendance.aggregate([
      { $match: attendanceMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          presentLike: {
            $sum: {
              $cond: [
                { $in: ['$status', ['Present', 'Late', 'Excused']] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const attendanceTotal = attendanceAgg[0]?.total || 0;
    const attendancePresentLike = attendanceAgg[0]?.presentLike || 0;
    const attendanceRate = attendanceTotal > 0 ? Number(((attendancePresentLike / attendanceTotal) * 100).toFixed(1)) : 0;

    // Revenue calculations using MonthlyPayment
    const paymentQuery = { school: schoolId, status: 'PAID' };
    if (branchId) paymentQuery.branch = branchId;
    const allPaidPayments = await MonthlyPayment.find(paymentQuery);
    const totalRevenue = allPaidPayments.reduce((acc, curr) => acc + curr.amount, 0);

    // This Month Revenue (based on paymentDate)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthPayments = allPaidPayments.filter(p => p.paymentDate && new Date(p.paymentDate) >= startOfMonth);
    const monthlyRevenue = thisMonthPayments.reduce((acc, curr) => acc + curr.amount, 0);

    // Today Revenue
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayPayments = allPaidPayments.filter(p => p.paymentDate && new Date(p.paymentDate) >= startOfToday);
    const todayRevenue = todayPayments.reduce((acc, curr) => acc + curr.amount, 0);

    // Paid vs Unpaid Students (for the most recent PaymentMonth)
    const latestMonthQuery = { school: schoolId };
    if (branchId) latestMonthQuery.branch = branchId;
    const latestMonth = await PaymentMonth.findOne(latestMonthQuery).sort({ year: -1, createdAt: -1 });
    
    let paidCount = 0;
    let unpaidCount = 0;
    if (latestMonth) {
      const paidQuery = { paymentMonth: latestMonth._id, status: 'PAID', school: schoolId };
      const unpaidQuery = { paymentMonth: latestMonth._id, status: 'UNPAID', school: schoolId };
      if (branchId) {
        paidQuery.branch = branchId;
        unpaidQuery.branch = branchId;
      }
      paidCount = await MonthlyPayment.countDocuments(paidQuery);
      unpaidCount = await MonthlyPayment.countDocuments(unpaidQuery);
    }

    // Revenue per month (last 6 months) for chart
    const revenueData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = d.toLocaleString('default', { month: 'short' });
      const year = d.getFullYear();
      const monthStart = new Date(year, d.getMonth(), 1);
      const monthEnd = new Date(year, d.getMonth() + 1, 0, 23, 59, 59);

      const amount = allPaidPayments
        .filter(p => p.paymentDate && new Date(p.paymentDate) >= monthStart && new Date(p.paymentDate) <= monthEnd)
        .reduce((sum, p) => sum + p.amount, 0);

      revenueData.push({ name: monthName, amount });
    }

    // Revenue per class
    const classes = await Class.find(query);
    const revenuePerClass = await Promise.all(classes.map(async (c) => {
      const amount = allPaidPayments
        .filter(p => p.class && p.class.toString() === c._id.toString())
        .reduce((sum, p) => sum + p.amount, 0);
      return { name: `${c.name}-${c.section}`, amount };
    }));

    // Class ranks (top classes by average marks)
    const markMatch = { school: schoolId };
    if (branchId) markMatch.branch = branchId;

    const classRanksAgg = await Mark.aggregate([
      { $match: markMatch },
      {
        $group: {
          _id: { class: '$class', student: '$student' },
          totalSum: { $sum: '$total' },
          marksCount: { $sum: 1 },
        },
      },
      {
        $project: {
          class: '$_id.class',
          student: '$_id.student',
          studentAvgPct: {
            $cond: [
              { $gt: ['$marksCount', 0] },
              { $multiply: [{ $divide: ['$totalSum', { $multiply: ['$marksCount', 100] }] }, 100] },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$class',
          averageMarks: { $avg: '$studentAvgPct' },
          studentCount: { $sum: 1 },
        },
      },
      { $sort: { averageMarks: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: 'classes',
          localField: '_id',
          foreignField: '_id',
          as: 'classDoc',
        },
      },
      { $unwind: { path: '$classDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          classId: '$_id',
          name: {
            $cond: [
              { $ifNull: ['$classDoc._id', false] },
              { $concat: ['$classDoc.name', '-', '$classDoc.section'] },
              'Unknown Class',
            ],
          },
          averageMarks: { $round: ['$averageMarks', 1] },
          studentCount: 1,
        },
      },
    ]);

    // Recent actions (latest system activities)
    const recentQuery = { school: schoolId };
    if (branchId) recentQuery.branch = branchId;

    const [recentStudents, recentMarks, recentExams, recentAttendance, recentPaid, recentSchedules] = await Promise.all([
      User.find({ role: 'student', ...recentQuery }).populate('branch', 'name').select('name createdAt branch').sort({ createdAt: -1 }).limit(5),
      Mark.find(recentQuery).populate('gradedBy', 'name role').populate('branch', 'name').sort({ createdAt: -1 }).limit(5),
      Exam.find(recentQuery).populate('branch', 'name').select('name status createdAt updatedAt branch').sort({ updatedAt: -1 }).limit(5),
      Attendance.find(recentQuery).populate('markedBy', 'name role').populate('branch', 'name').sort({ createdAt: -1 }).limit(5),
      MonthlyPayment.find({ ...recentQuery, status: 'PAID' }).populate('paidBy', 'name role').populate('branch', 'name').sort({ paymentDate: -1, updatedAt: -1 }).limit(5),
      Schedule.find(recentQuery).populate('teacher', 'name role').populate('branch', 'name').sort({ updatedAt: -1 }).limit(5),
    ]);

    const recentActionsRaw = [
      ...recentStudents.map(s => ({
        action: 'Added Student',
        user: 'Admin',
        branch: s.branch?.name,
        at: s.createdAt,
      })),
      ...recentMarks.map(m => ({
        action: 'Marks Submitted',
        user: m.gradedBy?.name ? `Teacher ${m.gradedBy.name}` : 'Teacher',
        branch: m.branch?.name,
        at: m.createdAt,
      })),
      ...recentExams.map(e => ({
        action: e.status === 'Published' ? 'Exam Published' : 'Exam Updated',
        user: 'Admin',
        branch: e.branch?.name,
        at: e.updatedAt || e.createdAt,
      })),
      ...recentAttendance.map(a => ({
        action: 'Attendance Taken',
        user: a.markedBy?.name ? `${a.markedBy.role === 'teacher' ? 'Teacher' : 'Admin'} ${a.markedBy.name}` : 'Teacher',
        branch: a.branch?.name,
        at: a.createdAt,
      })),
      ...recentPaid.map(p => ({
        action: 'Payment Marked Paid',
        user: p.paidBy?.name ? `Admin ${p.paidBy.name}` : 'Admin',
        branch: p.branch?.name,
        at: p.paymentDate || p.updatedAt,
      })),
      ...recentSchedules.map(s => ({
        action: 'Schedule Updated',
        user: s.teacher?.name ? `Teacher ${s.teacher.name}` : 'Admin',
        branch: s.branch?.name,
        at: s.updatedAt,
      })),
    ]
      .filter(x => x.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 10)
      .map((x, idx) => ({
        id: `${idx}-${new Date(x.at).getTime()}`,
        action: x.action,
        user: x.user,
        branch: x.branch,
        datetime: new Date(x.at).toISOString(),
      }));

    // Branch-wise stats (for School Admin consolidated view)
    let branchStats = [];
    if (req.user.role === 'schooladmin' && !branchId) {
      const branches = await Branch.find({ tenant: schoolId, deletedAt: { $exists: false } });
      branchStats = await Promise.all(branches.map(async (b) => {
        const studentCount = await User.countDocuments({ role: 'student', branch: b._id, school: schoolId });
        const teacherCount = await User.countDocuments({ role: 'teacher', branch: b._id, school: schoolId });
        const revenue = (await MonthlyPayment.find({ branch: b._id, school: schoolId, status: 'PAID' }))
          .reduce((sum, p) => sum + p.amount, 0);
        
        return {
          name: b.name,
          students: studentCount,
          teachers: teacherCount,
          revenue
        };
      }));
    }

    res.json({
      totalStudents,
      totalTeachers,
      totalClasses,
      totalRevenue,
      monthlyRevenue,
      todayRevenue,
      paidVsUnpaid: {
        paid: paidCount,
        unpaid: unpaidCount,
      },
      revenueData,
      revenuePerClass,
      attendanceRate,
      classRanks: classRanksAgg,
      recentActions: recentActionsRaw,
      branchStats // Only populated for school admin when no branch filter is active
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Teacher Dashboard Statistics ---
export const getTeacherDashboardStats = async (req, res) => {
  const teacherId = req.user._id;
  const schoolId = req.user.school?._id || req.user.school || req.schoolId;
  const branchId = req.branchId || req.user.branch;

  if (!schoolId) {
    return res.status(400).json({ message: 'Teacher is not associated with a school' });
  }

  try {
    const query = { teacher: teacherId, school: schoolId };
    if (branchId) query.branch = branchId;

    let assignments = await ClassSubject.find(query)
    .populate('class', 'name section')
    .populate('subject', 'name code')
    .populate('teacher', 'name');

    // --- Proactive Assignment ---
    // If teacher has NO assignments, and the user said "add them all now",
    // we proactively assign them to all available subjects in the school for testing.
    if (assignments.length === 0) {
      console.log(`Teacher ${teacherId} has no assignments. Proactively assigning to available subjects.`);
      const allSubjects = await ClassSubject.find({ school: schoolId });
      
      if (allSubjects.length > 0) {
        // Assign this teacher to all existing class-subject pairs in this school
        await ClassSubject.updateMany(
          { school: schoolId, teacher: { $exists: false } },
          { $set: { teacher: teacherId } }
        );
        // Re-fetch assignments
        assignments = await ClassSubject.find({ 
          teacher: teacherId, 
          school: schoolId 
        })
        .populate('class', 'name section')
        .populate('subject', 'name code')
        .populate('teacher', 'name');
      }
    }

    // Get unique class IDs
    const classIds = [...new Set(
      assignments
        .map((a) => a.class?._id)
        .filter(Boolean)
        .map(id => id.toString())
    )];

    const totalClasses = classIds.length;
    const totalSubjects = assignments.length;

    // Count total students in all assigned classes
    const totalStudents = await User.countDocuments({
      role: 'student',
      class: { $in: classIds },
      school: schoolId
    });

    console.log(`Stats for teacher ${teacherId}: Classes=${totalClasses}, Subjects=${totalSubjects}, Students=${totalStudents}`);
    
    // Format assignedClasses as requested
    const assignedClasses = assignments
      .filter(a => a.class)
      .map(a => ({
        _id: a.class._id,
        className: a.class.name,
        section: a.class.section
      }))
      .reduce((unique, item) => {
        // Remove duplicates by class ID
        const exists = unique.find(u => u._id.toString() === item._id.toString());
        if (!exists) unique.push(item);
        return unique;
      }, []);

    // Format assignedSubjects as requested
    const assignedSubjects = assignments
      .filter(a => a.subject)
      .map(a => ({
        _id: a.subject._id,
        name: a.subject.name,
        code: a.subject.code,
        classId: a.class?._id,
        className: a.class?.name,
        section: a.class?.section
      }));

    // Get today's schedule
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    const todaySchedule = await Schedule.find({
      teacher: teacherId,
      school: schoolId,
      day: today
    })
    .populate('class', 'name section')
    .populate('subject', 'name code')
    .sort({ startTime: 1 });

    const schedule = todaySchedule.map(s => ({
      _id: s._id,
      class: s.class ? `${s.class.name} ${s.class.section}` : 'N/A',
      classId: s.class?._id,
      className: s.class?.name,
      section: s.class?.section,
      subject: s.subject?.name || 'N/A',
      subjectId: s.subject?._id,
      start: s.startTime,
      end: s.endTime,
      day: s.day
    }));

    res.json({
      teacherId: teacherId.toString(),
      assignedClasses,      // Array of classes teacher teaches
      assignedSubjects,     // Array of subjects teacher teaches
      studentsCount: totalStudents,  // Total students across all classes
      schedule,             // Today's schedule
      // Also include legacy fields for backward compatibility
      totalClasses,
      totalSubjects,
      totalStudents,
      assignments
    });
  } catch (error) {
    console.error(`Teacher dashboard stats error for ${teacherId}:`, error);
    res.status(500).json({ message: error.message });
  }
};

// --- Schedule Management ---
export const getSchedules = async (req, res) => {
  try {
    const { classId } = req.query;
    const filter = { school: req.user.school };
    if (classId) filter.class = classId;
    if (req.branchId) filter.branch = req.branchId;

    const schedules = await Schedule.find(filter)
      .populate('class', 'name section')
      .populate('subject', 'name code')
      .populate('teacher', 'name')
      .populate('branch', 'name')
      .sort({ day: 1, startTime: 1 });

    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Exam Requests Management ---

export const getExamRequests = async (req, res) => {
  try {
    const exams = await Exam.find({ 
      school: req.user.school, 
      status: 'Pending' 
    })
    .populate('class', 'name section')
    .populate('subject', 'name code')
    .populate('requestedBy', 'name customId');
    
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const approveExamRequest = async (req, res) => {
  const { examId } = req.params;
  const { status } = req.body; // 'Scheduled' or 'Rejected'

  try {
    const exam = await Exam.findOne({ _id: examId, school: req.user.school });
    if (!exam) {
      return res.status(404).json({ message: 'Exam request not found' });
    }

    if (status === 'Scheduled') {
      exam.status = 'Scheduled';
    } else if (status === 'Rejected') {
      await exam.deleteOne();
      return res.json({ message: 'Exam request rejected and deleted' });
    } else {
      return res.status(400).json({ message: 'Invalid status. Use "Scheduled" or "Rejected"' });
    }

    await exam.save();
    res.json({ message: 'Exam request approved', exam });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createSchedule = async (req, res) => {
  try {
    const { classId, subjectId, teacherId, day, startTime, endTime, color } = req.body;

    // 1. Check if the class already has a period at this time
    const classConflict = await Schedule.findOne({
      school: req.user.school,
      class: classId,
      day,
      $and: [
        { startTime: { $lt: endTime } },
        { endTime: { $gt: startTime } }
      ]
    });

    if (classConflict) {
      return res.status(400).json({ 
        message: 'Class schedule conflict.',
        userMessage: `This class already has a period scheduled from ${classConflict.startTime} to ${classConflict.endTime}.`
      });
    }

    // 2. Check if the teacher is already teaching another class at this time
    const teacherConflict = await Schedule.findOne({
      school: req.user.school,
      teacher: teacherId,
      day,
      $and: [
        { startTime: { $lt: endTime } },
        { endTime: { $gt: startTime } }
      ]
    });

    if (teacherConflict) {
      return res.status(400).json({ 
        message: 'Teacher schedule conflict.',
        userMessage: `This teacher is already teaching another class from ${teacherConflict.startTime} to ${teacherConflict.endTime}.`
      });
    }

    const schedule = await Schedule.create({
      school: req.user.school,
      branch: req.branchId || req.user.branch,
      academicYear: req.academicYearName,
      class: classId,
      subject: subjectId,
      teacher: teacherId,
      day,
      startTime,
      endTime,
      color
    });

    res.status(201).json(schedule);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { classId, subjectId, teacherId, day, startTime, endTime, color } = req.body;

    const current = await Schedule.findOne({ _id: id, school: req.user.school });
    if (!current) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    const checkClass = classId || current.class;
    const checkDay = day || current.day;
    const checkStart = startTime || current.startTime;
    const checkEnd = endTime || current.endTime;
    const checkTeacher = teacherId || current.teacher;

    // 1. Check for class conflicts
    const classConflict = await Schedule.findOne({
      _id: { $ne: id },
      school: req.user.school,
      class: checkClass,
      day: checkDay,
      $and: [
        { startTime: { $lt: checkEnd } },
        { endTime: { $gt: checkStart } }
      ]
    });

    if (classConflict) {
      return res.status(400).json({ 
        message: 'Class schedule conflict.',
        userMessage: `This class already has a period scheduled from ${classConflict.startTime} to ${classConflict.endTime}.`
      });
    }

    // 2. Check for teacher conflicts
    const teacherConflict = await Schedule.findOne({
      _id: { $ne: id },
      school: req.user.school,
      teacher: checkTeacher,
      day: checkDay,
      $and: [
        { startTime: { $lt: checkEnd } },
        { endTime: { $gt: checkStart } }
      ]
    });

    if (teacherConflict) {
      return res.status(400).json({ 
        message: 'Teacher schedule conflict.',
        userMessage: `This teacher is already teaching another class from ${teacherConflict.startTime} to ${teacherConflict.endTime}.`
      });
    }

    const schedule = await Schedule.findOneAndUpdate(
      { _id: id, school: req.user.school },
      { class: checkClass, subject: subjectId || current.subject, teacher: checkTeacher, day: checkDay, startTime: checkStart, endTime: checkEnd, color: color || current.color },
      { new: true }
    );

    res.json(schedule);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await Schedule.findOneAndDelete({ _id: id, school: req.user.school });

    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Monthly Payment Management ---

/**
 * POST /admin/payment-months
 * Admin creates a payment month (e.g. March 2026 → $20 → all students)
 * Automatically creates UNPAID records for every eligible student.
 */
export const createPaymentMonth = async (req, res) => {
  const { month, year, amount, assignTo = 'ALL', classId } = req.body;
  const schoolId = req.user.school;

  try {
    // Prevent duplicate months
    const existing = await PaymentMonth.findOne({
      month, year, school: schoolId,
      class: assignTo === 'CLASS' ? classId : null,
    });
    if (existing) {
      return res.status(400).json({ message: `Payment month "${month} ${year}" already exists.` });
    }

    // Create the month config
    const pm = await PaymentMonth.create({
      month, year,
      monthLabel: `${month} ${year}`,
      amount,
      assignTo,
      class: assignTo === 'CLASS' ? classId : null,
      school: schoolId,
      branch: req.branchId || req.user.branch,
      academicYear: year.toString(),
      createdBy: req.user._id,
    });

    // Find eligible students
    const query = { role: 'student', school: schoolId, status: 'active' };
    if (assignTo === 'CLASS' && classId) query.class = classId;
    const students = await User.find(query).select('_id class monthlyFees branch school').populate('class', 'name section');

    // Bulk-insert UNPAID records
    const academicYear = year.toString();
    const records = await Promise.all(students.map(async (s) => {
      if (!s.branch) {
        console.warn(`[createPaymentMonth] Student ${s._id} has no branch assigned.`);
      }
      const baseAmount = s.monthlyFees || amount || 0;
      const feeCalculation = await calculateStudentMonthlyFee(
        s,
        baseAmount,
        new Date(year, Math.max(0, MONTH_NAMES.indexOf(month)), 1)
      );
      return {
        paymentMonth: pm._id,
        student: s._id,
        class: s.class,
        month,
        year,
        monthLabel: pm.monthLabel,
        amount: feeCalculation.finalAmount,
        originalAmount: feeCalculation.originalAmount,
        discountAmount: feeCalculation.discountAmount,
        appliedDiscounts: feeCalculation.appliedDiscounts,
        status: 'UNPAID',
        school: schoolId,
        branch: s.branch || req.branchId || req.user.branch, // Ensure branch is present
        academicYear: academicYear,
      };
    }));

    // Filter out any records that still don't have a branch (validation would fail)
    const validRecords = records.filter(r => r.branch);

    if (validRecords.length > 0) {
      await MonthlyPayment.insertMany(validRecords, { ordered: false });
    }

    // Update counts
    pm.totalStudents = validRecords.length;
    pm.unpaidCount = validRecords.length;
    pm.paidCount = 0;
    await pm.save();

    res.status(201).json({ paymentMonth: pm, created: validRecords.length, skipped: records.length - validRecords.length });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * GET /admin/payment-months
 * List all payment months for this school.
 */
export const getPaymentMonths = async (req, res) => {
  try {
    const { classId, status } = req.query;
    const query = { school: req.user.school };
    if (req.branchId) query.branch = req.branchId;

    const months = await PaymentMonth.find(query)
      .populate('class', 'name section')
      .sort({ year: -1, createdAt: -1 });

    // If no filters, return default static counts
    if ((!classId || classId === 'All Classes') && (!status || status === 'All Status')) {
      return res.json(months);
    }

    // Dynamic stats based on filters
    const filteredMonths = await Promise.all(months.map(async (pm) => {
      const baseFilter = { paymentMonth: pm._id, school: req.user.school };
      if (classId && classId !== 'All Classes') baseFilter.class = classId;
      if (req.branchId) baseFilter.branch = req.branchId;
      
      const total = await MonthlyPayment.countDocuments(baseFilter);
      const paid = await MonthlyPayment.countDocuments({ ...baseFilter, status: 'PAID' });
      const unpaid = await MonthlyPayment.countDocuments({ ...baseFilter, status: 'UNPAID' });

      const doc = pm.toObject();
      return {
        ...doc,
        totalStudents: total,
        paidCount: paid,
        unpaidCount: unpaid,
      };
    }));

    res.json(filteredMonths);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/monthly-payments
 * Query params: month, year, classId, status (PAID|UNPAID), startDate, endDate
 */
export const getMonthlyPayments = async (req, res) => {
  const { month, year, classId, status, startDate, endDate } = req.query;
  try {
    const filter = { school: req.user.school?._id || req.user.school };
    if (req.branchId) filter.branch = req.branchId;
    
    // Normalize and validate month
    if (month && month !== 'undefined' && month !== 'null' && month !== '' && month !== 'all') {
      // Ensure month is capitalized (e.g., "april" -> "April") to match DB storage
      filter.month = month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
    }
    
    // Normalize and validate year
    if (year && year !== 'undefined' && year !== 'null' && year !== '' && year !== 'all') {
      filter.year = Number(year);
    }
    
    if (classId && classId !== 'undefined' && classId !== 'null' && classId !== '' && classId !== 'all') {
      filter.class = classId;
    }

    if (status && status !== 'undefined' && status !== 'null' && status !== '' && status !== 'all') {
      // API uses PAID/UNPAID based on schema enum
      filter.status = status.toUpperCase();
    }

    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) filter.paymentDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.paymentDate.$lte = end;
      }
    }

    const payments = await MonthlyPayment.find(filter)
      .populate('student', 'name customId')
      .populate('class', 'name section')
      .populate('paidBy', 'name')
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /admin/monthly-payments/:id/mark-paid
 * Admin marks a single student's payment as PAID.
 */
export const markPaymentPaid = async (req, res) => {
  const { id } = req.params;
  const { remarks = '' } = req.body;
  try {
    const mp = await MonthlyPayment.findOne({ _id: id, school: req.user.school })
      .populate('student', 'name customId');
    if (!mp) {
      return res.status(404).json({
        message: 'Payment record not found.',
        userMessage: 'Payment record not found.'
      });
    }

    const oldValue = {
      status: mp.status,
      paymentDate: mp.paymentDate,
      remarks: mp.remarks,
      paidBy: mp.paidBy,
    };

    mp.status = 'PAID';
    mp.paymentDate = new Date();
    mp.paidBy = req.user._id;
    mp.remarks = remarks;
    await mp.save();

    logFinanceAction(req, {
      action: 'PAYMENT_MARK_PAID',
      targetId: mp._id,
      oldValue,
      newValue: {
        status: mp.status,
        paymentDate: mp.paymentDate,
        remarks: mp.remarks,
        paidBy: mp.paidBy,
      },
      academicYear: mp.academicYear,
      metadata: { studentId: mp.student?._id, studentName: mp.student?.name },
    });

    // Refresh counts on the PaymentMonth config
    const paidCount = await MonthlyPayment.countDocuments({ paymentMonth: mp.paymentMonth, status: 'PAID', school: req.user.school });
    const unpaidCount = await MonthlyPayment.countDocuments({ paymentMonth: mp.paymentMonth, status: 'UNPAID', school: req.user.school });
    await PaymentMonth.findByIdAndUpdate(mp.paymentMonth, { paidCount, unpaidCount });

    res.json({
      message: 'Payment marked as paid',
      userMessage: `Payment for ${mp.student.name} (${mp.monthLabel}) marked as paid successfully.`,
      payment: mp
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
      userMessage: 'Failed to mark payment as paid. Please try again.'
    });
  }
};

/**
 * PUT /admin/monthly-payments/:id/mark-unpaid
 * Admin reverts a payment to UNPAID.
 */
export const markPaymentUnpaid = async (req, res) => {
  const { id } = req.params;
  try {
    const mp = await MonthlyPayment.findOne({ _id: id, school: req.user.school });
    if (!mp) return res.status(404).json({ message: 'Payment record not found.' });

    const oldValue = {
      status: mp.status,
      paymentDate: mp.paymentDate,
      remarks: mp.remarks,
      paidBy: mp.paidBy,
    };

    mp.status = 'UNPAID';
    mp.paymentDate = null;
    mp.paidBy = null;
    mp.remarks = '';
    await mp.save();

    logFinanceAction(req, {
      action: 'PAYMENT_MARK_UNPAID',
      targetId: mp._id,
      oldValue,
      newValue: {
        status: mp.status,
        paymentDate: mp.paymentDate,
        remarks: mp.remarks,
        paidBy: mp.paidBy,
      },
      academicYear: mp.academicYear,
    });

    const paidCount = await MonthlyPayment.countDocuments({ paymentMonth: mp.paymentMonth, status: 'PAID', school: req.user.school });
    const unpaidCount = await MonthlyPayment.countDocuments({ paymentMonth: mp.paymentMonth, status: 'UNPAID', school: req.user.school });
    await PaymentMonth.findByIdAndUpdate(mp.paymentMonth, { paidCount, unpaidCount });

    res.json({
      message: 'Payment marked as unpaid',
      userMessage: 'Payment reverted to unpaid successfully.',
      payment: mp
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
      userMessage: 'Failed to revert payment. Please try again.'
    });
  }
};

/**
 * POST /admin/generate-monthly-payments
 * Manual trigger to generate payments for current month
 */
export const generateMonthlyPaymentsManual = async (req, res) => {
  try {
    const { month, year, branchId } = req.body;
    const { generateMonthlyPayments } = await import('../services/paymentScheduler.js');
    const schoolId = req.user.school?._id || req.user.school;
    
    // Academic Year requirement check
    const academicYear = req.academicYearId || req.academicYearName;
    if (!academicYear) {
      return res.status(400).json({
        message: 'Academic Year is required',
        userMessage: 'Please select an active academic year to generate payments.'
      });
    }

    // Branch resolution logic
    let targetBranchId = req.branchId; // from middleware (for branch managers)
    if (!targetBranchId) { // if school admin (req.branchId is null)
      if (branchId === 'ALL') {
        targetBranchId = null; // Generate for all branches
      } else if (branchId) {
        targetBranchId = branchId; // Generate for specific selected branch
      } else {
        // Default to main branch if none selected
        const Branch = (await import('../models/Branch.js')).default;
        const mainBranch = await Branch.findOne({ tenant: schoolId, status: 'active', $or: [{ name: 'Main Branch' }, { code: 'MAIN' }] });
        targetBranchId = mainBranch ? mainBranch._id.toString() : null;
      }
    }

    const result = await generateMonthlyPayments(schoolId, month, year, targetBranchId, academicYear);
    
    res.json({
      message: 'Monthly payments generated',
      userMessage: `Generated ${result.createdCount} payment records for ${month || 'current month'}. ${result.skippedCount} skipped.`,
      result
    });
  } catch (error) {
    console.error('[generateMonthlyPaymentsManual] Error:', error);
    res.status(500).json({
      message: error.message,
      userMessage: 'Failed to generate payments. Please try again.'
    });
  }
};

/**
 * GET /admin/payment-stats
 * Get payment statistics for dashboard
 * Query params: month, year, classId (optional)
 */
export const getPaymentStats = async (req, res) => {
  try {
    const { month, year, classId } = req.query;
    const now = new Date();
    const schoolId = req.user.school?._id || req.user.school;
    
    // Normalize target month/year from query or fallback to now
    let targetMonth = month;
    if (targetMonth && targetMonth !== 'undefined' && targetMonth !== 'null' && targetMonth !== '') {
      targetMonth = targetMonth.charAt(0).toUpperCase() + targetMonth.slice(1).toLowerCase();
    } else {
      targetMonth = now.toLocaleString('default', { month: 'long' });
    }

    let targetYear = year;
    if (targetYear && targetYear !== 'undefined' && targetYear !== 'null' && targetYear !== '') {
      targetYear = Number(targetYear);
    } else {
      targetYear = now.getFullYear();
    }

    // Direct query on MonthlyPayment for maximum accuracy across all payment sources
    const filter = {
      month: targetMonth,
      year: targetYear,
      school: schoolId
    };

    if (req.branchId) filter.branch = req.branchId;

    if (classId && classId !== 'undefined' && classId !== 'null' && classId !== '') {
      filter.class = classId;
    }

    const payments = await MonthlyPayment.find(filter);

    const stats = {
      totalExpected: payments.reduce((sum, p) => sum + p.amount, 0),
      totalCollected: payments
        .filter(p => p.status === 'PAID')
        .reduce((sum, p) => sum + p.amount, 0),
      totalUnpaid: payments
        .filter(p => p.status === 'UNPAID')
        .reduce((sum, p) => sum + p.amount, 0),
      paidCount: payments.filter(p => p.status === 'PAID').length,
      unpaidCount: payments.filter(p => p.status === 'UNPAID').length,
      totalStudents: payments.length,
    };

    res.json({
      currentMonth: `${targetMonth} ${targetYear}`,
      stats
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
      userMessage: 'Failed to fetch payment statistics.'
    });
  }
};

/**
 * GET /admin/payment-matrix
 * Returns a pivot table: each student + their status per month.
 * Query: classId (optional)
 * Response: { months: [...], students: [{ student, payments: { monthLabel: { status, _id, amount } } }] }
 */
export const getPaymentMatrix = async (req, res) => {
  const { classId } = req.query;
  const schoolId = req.user.school;
  const branchId = req.branchId;
  try {
    const studentFilter = { role: 'student', school: schoolId };
    if (classId) studentFilter.class = classId;
    if (branchId) studentFilter.branch = branchId;
    
    const students = await User.find(studentFilter).populate('class', 'name section');

    const monthFilter = { school: schoolId };
    if (branchId) monthFilter.branch = branchId;
    const months = await PaymentMonth.find(monthFilter)
      .sort({ year: 1, createdAt: 1 });

    const studentIds = students.map(s => s._id);
    const paymentFilter = {
      school: schoolId,
      student: { $in: studentIds },
    };
    if (branchId) paymentFilter.branch = branchId;

    const allPayments = await MonthlyPayment.find(paymentFilter);

    // Build lookup: studentId → monthLabel → payment
    const lookup = {};
    allPayments.forEach(p => {
      const sid = p.student.toString();
      if (!lookup[sid]) lookup[sid] = {};
      lookup[sid][p.monthLabel] = {
        _id: p._id,
        status: p.status,
        amount: p.amount,
        paymentDate: p.paymentDate,
      };
    });

    const matrix = students.map(s => ({
      student: { _id: s._id, name: s.name, customId: s.customId, class: s.class },
      payments: lookup[s._id.toString()] || {},
    }));

    res.json({ months, matrix });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /admin/payment-months/:id
 * Deletes a payment month config and all its student records.
 */
export const deletePaymentMonth = async (req, res) => {
  const { id } = req.params;
  try {
    const pm = await PaymentMonth.findOne({ _id: id, school: req.user.school });
    if (!pm) return res.status(404).json({ message: 'Payment month not found.' });

    await MonthlyPayment.deleteMany({ paymentMonth: id, school: req.user.school });
    await PaymentMonth.findByIdAndDelete(id);

    res.json({ message: `Payment month "${pm.monthLabel}" deleted.` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /admin/bulk-submit-marks
 * Admin bulk submits marks for one student across multiple exams in a term.
 * Logic: Updates individual Mark records and auto-calculates term-based totals.
 */
export const bulkSubmitMarks = async (req, res) => {
  const { studentId, examResults } = req.body; // examResults: [{ examId, marks, remarks }]
  const schoolId = req.user.school;

  try {
    const student = await User.findOne({ _id: studentId, role: 'student', school: schoolId });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const results = [];
    for (const item of examResults) {
      const exam = await Exam.findOne({ _id: item.examId, school: schoolId });
      if (!exam) continue;

      // Update or create Mark record
      const mark = await Mark.findOneAndUpdate(
        { student: studentId, subject: exam.subject, class: exam.class, school: schoolId },
        {
          $set: {
            [exam.term.toLowerCase()]: Number(item.marks) || 0,
            remarks: item.remarks || '',
            gradedBy: req.user._id,
          }
        },
        { upsert: true, new: true }
      );
      results.push(mark);
    }

    res.json({ message: 'Bulk marks submitted successfully', results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/class-results/:classId
 * Aggregates all marks for a class and calculates rank, weighted average, and term totals.
 */
export const getClassResults = async (req, res) => {
  const { classId, examName } = req.params;
  const schoolId = req.user.school?._id || req.user.school;

  try {
    const students = await User.find({ class: classId, role: 'student', school: schoolId });
    const assignments = await ClassSubject.find({ class: classId, school: schoolId }).populate('subject');
    const assignedSubjects = assignments.map((a) => a.subject).filter(Boolean);

    // Also find any subjects that have marks recorded for this class but might not be explicitly assigned
    const marksForClass = await Mark.find({ class: classId, school: schoolId }).distinct('subject');
    const markSubjectIds = marksForClass.map(id => id.toString());
    const assignedSubjectIds = assignedSubjects.map(s => s._id.toString());
    
    const missingSubjectIds = markSubjectIds.filter(id => !assignedSubjectIds.includes(id));
    const missingSubjects = await Subject.find({ _id: { $in: missingSubjectIds } });

    const subjects = [...assignedSubjects, ...missingSubjects];

    // We expect each subject to have M1(10), Mid(20), M2(10), Final(60) = 100 total
    let maxMarksPerSubject = 100;
    if (examName) {
      const lowerExam = examName.toLowerCase();
      if (lowerExam === 'monthly1') maxMarksPerSubject = 10;
      else if (lowerExam === 'midterm') maxMarksPerSubject = 30;
      else if (lowerExam === 'monthly2') maxMarksPerSubject = 40;
      else if (lowerExam === 'final') maxMarksPerSubject = 100;
    }

    const totalPossibleMarks = subjects.length * maxMarksPerSubject;

    const results = await Promise.all(students.map(async (student) => {
      const allMarks = await Mark.find({ student: student._id, class: classId, school: schoolId });
      
      // Filter marks to only include subjects assigned to this class
      const subjectIds = subjects.map(s => s._id.toString());
      const marks = allMarks.filter(m => subjectIds.includes(m.subject.toString()));

      // Aggregate across assigned subjects for this student
      const m1Total = marks.reduce((sum, m) => sum + (m.monthly1 || 0), 0);
      const midTotal = marks.reduce((sum, m) => sum + (m.midterm || 0), 0);
      const m2Total = marks.reduce((sum, m) => sum + (m.monthly2 || 0), 0);
      const finalTotal = marks.reduce((sum, m) => sum + (m.final || 0), 0);

      // Cumulative totals for ranking progression
      const progM1 = m1Total;
      const progMid = m1Total + midTotal;
      const progM2 = m1Total + midTotal + m2Total;
      const progFinal = m1Total + midTotal + m2Total + finalTotal;

      let grandTotal = 0;
      if (examName) {
        const lowerExam = examName.toLowerCase();
        if (lowerExam === 'monthly1') grandTotal = progM1;
        else if (lowerExam === 'midterm') grandTotal = progMid;
        else if (lowerExam === 'monthly2') grandTotal = progM2;
        else grandTotal = progFinal;
      } else {
        grandTotal = progFinal;
      }

      const avg = totalPossibleMarks > 0 ? (grandTotal / totalPossibleMarks) * 100 : 0;
      const roundedAvg = Math.round(avg);
      const grade = calculateGrade(roundedAvg);

      const subjectMarks = subjects.map(sub => {
        const m = marks.find(mk => mk.subject.toString() === sub._id.toString());
        let scoreToDisplay = 0;
        
        if (examName) {
          const lowerExam = examName.toLowerCase();
          if (lowerExam === 'monthly1') scoreToDisplay = m?.monthly1 || 0;
          else if (lowerExam === 'midterm') scoreToDisplay = (m?.monthly1 || 0) + (m?.midterm || 0);
          else if (lowerExam === 'monthly2') scoreToDisplay = (m?.monthly1 || 0) + (m?.midterm || 0) + (m?.monthly2 || 0);
          else scoreToDisplay = (m?.monthly1 || 0) + (m?.midterm || 0) + (m?.monthly2 || 0) + (m?.final || 0);
        } else {
          scoreToDisplay = (m?.monthly1 || 0) + (m?.midterm || 0) + (m?.monthly2 || 0) + (m?.final || 0);
        }
        
        return {
          subjectId: sub._id,
          subjectName: sub.name,
          score: scoreToDisplay
        };
      });

      return {
        student: { _id: student._id, name: student.name, customId: student.customId },
        progM1, progMid, progM2, progFinal,
        total: grandTotal,
        average: roundedAvg,
        grade: grade,
        totalPossibleMarks,
        subjectMarks
      };
    }));

    // Calculate position/rank for all stages
    const stages = ['progM1', 'progMid', 'progM2', 'progFinal'];
    stages.forEach(stage => {
      results.sort((a, b) => b[stage] - a[stage]);
      let currentRank = 1;
      results.forEach((r, idx) => {
        if (idx > 0 && r[stage] < results[idx - 1][stage]) currentRank = idx + 1;
        if (!r.ranks) r.ranks = {};
        r.ranks[stage.replace('prog', '').toLowerCase()] = currentRank;
      });
    });

    // Calculate subject-level rankings and summary stats
    const subjectStats = {};
    subjects.forEach(sub => {
      const scores = results.map(r => ({
        studentId: r.student._id,
        score: r.subjectMarks.find(sm => sm.subjectId.toString() === sub._id.toString())?.score || 0
      }));

      scores.sort((a, b) => b.score - a.score);
      
      let currentSubRank = 1;
      scores.forEach((s, idx) => {
        if (idx > 0 && s.score < scores[idx - 1].score) currentSubRank = idx + 1;
        const studentResult = results.find(r => r.student._id.toString() === s.studentId.toString());
        if (studentResult) {
          const sm = studentResult.subjectMarks.find(sm => sm.subjectId.toString() === sub._id.toString());
          if (sm) sm.rank = currentSubRank;
        }
      });

      const allScores = scores.map(s => s.score);
      subjectStats[sub._id] = {
        highest: Math.max(...allScores, 0),
        average: allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0
      };
    });

    // Final sort by the selected total
    results.sort((a, b) => b.total - a.total);
    results.forEach((r, idx) => {
      if (idx > 0 && r.total < results[idx - 1].total) r.position = idx + 1;
      else if (idx === 0) r.position = 1;
      else r.position = results[idx-1].position;
    });

    res.json({ results, subjectStats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /admin/academic-summary/:studentId
 * Generates an academic summary/report card for a given student after the final exam.
 * Adds together all subjects taken and shows achievements per subject.
 */
export const getStudentAcademicSummary = async (req, res) => {
  const { studentId } = req.params;
  const schoolId = req.user.school;

  try {
    const student = await User.findOne({ _id: studentId, role: 'student', school: schoolId }).populate('class');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const marks = await Mark.find({ student: studentId, school: schoolId }).populate('subject', 'name code');

    let grandTotal = 0;
    const maxMarksPerSubject = 100;
    const totalPossibleMarks = marks.length * maxMarksPerSubject;

    const subjectsSummary = marks.map((m) => {
      const subjectTotal = m.total || ((m.monthly1 || 0) + (m.midterm || 0) + (m.monthly2 || 0) + (m.final || 0));
      grandTotal += subjectTotal;
      return {
        subject: m.subject ? m.subject.name : 'Unknown Subject',
        code: m.subject ? m.subject.code : '',
        m1: m.monthly1 || 0,
        mid: m.midterm || 0,
        m2: m.monthly2 || 0,
        final: m.final || 0,
        total: subjectTotal,
        grade: calculateGrade((subjectTotal / maxMarksPerSubject) * 100),
        remarks: m.remarks
      };
    });

    const average = totalPossibleMarks > 0 ? (grandTotal / totalPossibleMarks) * 100 : 0;

    res.json({
      student: {
        _id: student._id,
        name: student.name,
        customId: student.customId,
        className: student.class ? student.class.name : '',
        section: student.class ? student.class.section : ''
      },
      subjectsSummary,
      grandTotal,
      totalPossibleMarks,
      average: Number(average.toFixed(2)),
      overallGrade: calculateGrade(average),
      hasFinalMarks: marks.some(m => (m.final || 0) > 0)
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── School Settings ───────────────────────────────────────────────────────────

/**
 * GET /admin/school-settings
 * Returns the school document for the logged-in admin.
 */
export const getSchoolSettings = async (req, res) => {
  try {
    if (!req.user.school) {
      return res.status(404).json({ message: 'No school linked to your admin account.' });
    }
    const school = await School.findById(req.user.school).populate('subscription.plan');
    if (!school) return res.status(404).json({ message: 'School not found.' });
    
    // Get feature overrides
    const featureOverrides = await SchoolFeatureOverride.find({ school: school._id });
    const enabledFeatures = await getEnabledFeaturesForSchool(school._id);
    
    res.json({
      ...school.toObject(),
      featureOverrides,
      enabledFeatures
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /admin/school-settings
 * Admin updates the school profile, including the EVC Plus merchant number.
 * Body: { name?, address?, phone?, email?, merchantNumber? }
 */
export const updateSchoolSettings = async (req, res) => {
  const {
    name,
    logo,
    motto,
    address,
    phone,
    email,
    website,
    merchantNumber,
    settings,
  } = req.body;
  try {
    if (!req.user.school) {
      return res.status(404).json({ message: 'No school linked to your admin account.' });
    }
    const school = await School.findById(req.user.school);
    if (!school) return res.status(404).json({ message: 'School not found.' });

    if (name           !== undefined) school.name           = name;
    if (logo           !== undefined) {
      if (!logo) {
        return res.status(400).json({ message: 'School logo is required.' });
      }
      school.logo = logo;
    }
    if (motto          !== undefined) school.motto          = motto;
    if (address        !== undefined) school.address        = address;
    if (phone          !== undefined) school.phone          = phone;
    if (email          !== undefined) school.email          = email;
    if (website        !== undefined) school.website        = website;
    if (merchantNumber !== undefined) school.merchantNumber = merchantNumber;
    if (settings       !== undefined) {
      school.settings = {
        ...(school.settings?.toObject?.() || school.settings || {}),
        ...settings,
        academicYearSettings: {
          ...(school.settings?.academicYearSettings || {}),
          ...(settings?.academicYearSettings || {}),
        },
      };
    }

    await school.save();
    res.json({ message: 'School settings updated successfully.', school });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ── Password Reset for Teachers and Students ───────────────────────────────────

/**
 * PUT /admin/teachers/:id/reset-password
 * Admin resets a teacher's password
 */
const generateTemporaryPassword = () => {
  const token = crypto.randomBytes(5).toString('base64url');
  return `Dugsi${token}7`;
};

const validateAccountPassword = (password) => {
  if (!password || password.length < 8) return 'Password must be at least 8 characters long';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
};

const resetScopedUserPassword = async (req, res, role, label) => {
  const { id } = req.params;
  const { newPassword, generateRandom = false } = req.body;

  try {
    const password = generateRandom ? generateTemporaryPassword() : newPassword;
    const validationError = validateAccountPassword(password);
    if (validationError) {
      return res.status(400).json({
        message: validationError,
        userMessage: `${validationError}.`
      });
    }

    const schoolId = req.user.school?._id || req.user.school;
    const query = {
      _id: id,
      role,
      school: schoolId,
      isDeleted: { $ne: true },
      deletedAt: { $exists: false }
    };
    if (req.branchId) query.branch = req.branchId;

    const account = await User.findOne(query);
    if (!account) {
      return res.status(404).json({
        message: `${label} not found`,
        userMessage: `${label} not found in your school or branch.`
      });
    }

    account.password = password;
    account.credentialsGenerated = true;
    account.tokenVersion = (account.tokenVersion || 0) + 1;
    await account.save();

    await sendNotification({
      recipientId: account._id,
      schoolId,
      branchId: account.branch || req.branchId,
      title: 'Password Reset',
      message: 'Your DugsiHub password was reset by an authorized administrator.',
      type: 'security',
      priority: 'high',
      metadata: {
        action: 'PASSWORD_RESET',
        role,
        resetBy: req.user._id
      },
      emailData: account.email ? {
        to: account.email,
        subject: 'Your DugsiHub password was reset',
        html: `
          <p>Hello ${account.name},</p>
          <p>Your DugsiHub account password was reset by your school administrator.</p>
          <p><strong>Username:</strong> ${account.customId || account.email || account.phone || 'Your registered login'}</p>
          <p><strong>Temporary password:</strong> ${password}</p>
          <p>Please sign in and change this password if your portal supports password changes.</p>
        `
      } : null,
      smsData: role === 'parent' && account.phone ? {
        to: account.phone,
        body: `DugsiHub password reset. Username: ${account.customId || account.email || account.phone}. Password: ${password}`
      } : null
    });

    logAction(req, {
      action: `${role.toUpperCase()}_PASSWORD_RESET`,
      module: 'ACCOUNT_SECURITY',
      targetId: account._id,
      details: {
        role,
        customId: account.customId,
        emailSent: Boolean(account.email),
        smsQueued: role === 'parent' && Boolean(account.phone),
        generatedRandom: Boolean(generateRandom),
        branch: account.branch,
        school: schoolId
      }
    });

    res.json({
      message: `${label} password reset successfully`,
      userMessage: `Password for ${account.name} has been reset successfully.`,
      generatedPassword: generateRandom ? password : undefined
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
      userMessage: 'Failed to reset password. Please try again.'
    });
  }
};

export const resetTeacherPassword = (req, res) => resetScopedUserPassword(req, res, 'teacher', 'Teacher');

/**
 * PUT /admin/students/:id/reset-password
 * Admin resets a student's password
 */
/**
 * PUT /admin/students/:id/reset-password
 * Admin resets a student's password
 */
export const resetStudentPassword = (req, res) => resetScopedUserPassword(req, res, 'student', 'Student');
export const resetParentPassword = (req, res) => resetScopedUserPassword(req, res, 'parent', 'Parent');

// --- Announcement Management ---
import Announcement from '../models/Announcement.js';

export const getAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find({ school: req.user.school })
      .populate('createdBy', 'name role')
      .populate('targetClass', 'name section')
      .sort({ createdAt: -1 });
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Failed to load announcements.'
    });
  }
};

export const createAnnouncement = async (req, res) => {
  const { title, content, audience, targetClass, priority, expiresAt, media } = req.body;
  
  try {
    if (!title || !title.trim()) {
      return res.status(400).json({ 
        message: 'Title is required',
        userMessage: 'Title is required.'
      });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ 
        message: 'Content is required',
        userMessage: 'Content is required.'
      });
    }

    const announcement = await Announcement.create({
      title: title.trim(),
      content: content.trim(),
      audience: audience || 'all',
      targetClass: audience === 'class' ? targetClass : undefined,
      priority: priority || 'normal',
      expiresAt: expiresAt || undefined,
      media: media || undefined,
      school: req.user.school,
      createdBy: req.user._id,
    });

    const populated = await Announcement.findById(announcement._id)
      .populate('createdBy', 'name role')
      .populate('targetClass', 'name section');

    // Notify relevant users (in-app)
    const audienceQuery = {
      school: req.user.school,
      deletedAt: { $exists: false },
      status: 'active',
    };
    if (audience === 'students') audienceQuery.role = 'student';
    else if (audience === 'teachers') audienceQuery.role = 'teacher';
    else if (audience === 'parents') audienceQuery.role = 'parent';
    else if (audience === 'class' && targetClass) {
      audienceQuery.role = 'student';
      audienceQuery.class = targetClass;
    }

    const recipients = await User.find(audienceQuery).select('_id branch').limit(500);
    if (recipients.length) {
      await broadcastNotification({
        recipientIds: recipients.map((r) => r._id),
        schoolId: req.user.school,
        branchId: req.branchId || recipients[0]?.branch,
        title: `New Announcement: ${announcement.title}`,
        message: announcement.content.slice(0, 180),
        type: 'announcement',
      });
    }

    res.status(201).json({
      message: 'Announcement created successfully',
      userMessage: 'Announcement published successfully.',
      announcement: populated,
    });
  } catch (error) {
    res.status(400).json({ 
      message: error.message,
      userMessage: 'Failed to create announcement. Please try again.'
    });
  }
};

export const updateAnnouncement = async (req, res) => {
  const { id } = req.params;
  const { title, content, audience, targetClass, priority, status, expiresAt, media } = req.body;

  try {
    const announcement = await Announcement.findOne({ _id: id, school: req.user.school });
    if (!announcement) {
      return res.status(404).json({ 
        message: 'Announcement not found',
        userMessage: 'Announcement not found.'
      });
      
    }

    if (title !== undefined) announcement.title = title.trim();
    if (content !== undefined) announcement.content = content.trim();
    if (audience !== undefined) announcement.audience = audience;
    if (targetClass !== undefined) announcement.targetClass = audience === 'class' ? targetClass : undefined;
    if (priority !== undefined) announcement.priority = priority;
    if (status !== undefined) announcement.status = status;
    if (expiresAt !== undefined) announcement.expiresAt = expiresAt || undefined;
    if (media !== undefined) announcement.media = media || undefined;

    await announcement.save();

    const populated = await Announcement.findById(announcement._id)
      .populate('createdBy', 'name role')
      .populate('targetClass', 'name section');

    res.json({
      message: 'Announcement updated successfully',
      userMessage: 'Announcement updated successfully.',
      announcement: populated,
    });
  } catch (error) {
    res.status(400).json({ 
      message: error.message,
      userMessage: 'Failed to update announcement. Please try again.'
    });
  }
};

export const deleteAnnouncement = async (req, res) => {
  const { id } = req.params;

  try {
    const announcement = await Announcement.findOneAndDelete({ _id: id, school: req.user.school });
    if (!announcement) {
      return res.status(404).json({ 
        message: 'Announcement not found',
        userMessage: 'Announcement not found.'
      });
    }

    res.json({
      message: 'Announcement deleted successfully',
      userMessage: 'Announcement deleted successfully.'
    });
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Failed to delete announcement. Please try again.'
    });
  }
};

// --- Asset CRUD Additions ---
export const updateAsset = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const asset = await Asset.findOneAndUpdate(
      { _id: id, school: schoolId },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    ).populate('assignedTo', 'name');
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json(asset);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAsset = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const asset = await Asset.findOneAndDelete({ _id: id, school: schoolId });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Library CRUD Additions ---
export const updateLibraryBook = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const book = await LibraryBook.findOneAndUpdate(
      { _id: id, school: schoolId },
      req.body,
      { new: true }
    );
    if (!book) return res.status(404).json({ message: 'Book not found' });
    res.json(book);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteLibraryBook = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const book = await LibraryBook.findOneAndDelete({ _id: id, school: schoolId });
    if (!book) return res.status(404).json({ message: 'Book not found' });
    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Transport CRUD Additions ---
export const updateTransportRoute = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const route = await TransportRoute.findOneAndUpdate(
      { _id: id, school: schoolId },
      req.body,
      { new: true }
    );
    if (!route) return res.status(404).json({ message: 'Route not found' });
    res.json(route);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteTransportRoute = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const route = await TransportRoute.findOneAndDelete({ _id: id, school: schoolId });
    if (!route) return res.status(404).json({ message: 'Route not found' });
    res.json({ message: 'Route deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateTransportVehicle = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const vehicle = await TransportVehicle.findOneAndUpdate(
      { _id: id, school: schoolId },
      req.body,
      { new: true }
    );
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteTransportVehicle = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const vehicle = await TransportVehicle.findOneAndDelete({ _id: id, school: schoolId });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Certificate CRUD Additions ---
export const getCertificates = async (req, res) => {
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const branchId = await resolveBranchId(req);
    const query = { school: schoolId };
    if (branchId) query.branch = branchId;
    const certificates = await Certificate.find(query)
      .populate('student', 'name customId class')
      .populate('issuedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(certificates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCertificate = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const cert = await Certificate.findOneAndUpdate(
      { _id: id, school: schoolId },
      req.body,
      { new: true }
    ).populate('student', 'name customId');
    if (!cert) return res.status(404).json({ message: 'Certificate not found' });
    res.json(cert);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCertificate = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const cert = await Certificate.findOneAndDelete({ _id: id, school: schoolId });
    if (!cert) return res.status(404).json({ message: 'Certificate not found' });
    res.json({ message: 'Certificate deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Hostel Management ---
export const getHostels = async (req, res) => {
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const branchId = await resolveBranchId(req);
    const query = { school: schoolId, deletedAt: { $exists: false } };
    if (branchId) query.branch = branchId;
    const hostels = await Hostel.find(query).sort({ createdAt: -1 });
    // Get room counts for each hostel
    const hostelIds = hostels.map(h => h._id);
    const rooms = await HostelRoom.find({ hostel: { $in: hostelIds }, deletedAt: { $exists: false } });
    const hostelData = hostels.map(h => {
      const hostelRooms = rooms.filter(r => r.hostel.toString() === h._id.toString());
      return {
        ...h.toObject(),
        totalRooms: hostelRooms.length,
        totalCapacity: hostelRooms.reduce((s, r) => s + r.capacity, 0),
        availableBeds: hostelRooms.reduce((s, r) => s + r.availableBeds, 0)
      };
    });
    res.json(hostelData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createHostel = async (req, res) => {
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const branchId = await resolveBranchId(req);
    const hostel = await Hostel.create({
      ...req.body,
      school: schoolId,
      branch: branchId,
      createdBy: req.user._id
    });
    res.status(201).json(hostel);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateHostel = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const hostel = await Hostel.findOneAndUpdate(
      { _id: id, school: schoolId, deletedAt: { $exists: false } },
      { ...req.body, updatedBy: req.user._id },
      { new: true }
    );
    if (!hostel) return res.status(404).json({ message: 'Hostel not found' });
    res.json(hostel);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteHostel = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const hostel = await Hostel.findOneAndUpdate(
      { _id: id, school: schoolId },
      { deletedAt: new Date(), deletedBy: req.user._id },
      { new: true }
    );
    if (!hostel) return res.status(404).json({ message: 'Hostel not found' });
    res.json({ message: 'Hostel deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getHostelRooms = async (req, res) => {
  const { hostelId } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const rooms = await HostelRoom.find({ hostel: hostelId, school: schoolId, deletedAt: { $exists: false } })
      .sort({ roomNumber: 1 });
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createHostelRoom = async (req, res) => {
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const branchId = await resolveBranchId(req);
    const room = await HostelRoom.create({
      ...req.body,
      school: schoolId,
      branch: branchId,
      availableBeds: req.body.capacity,
      createdBy: req.user._id
    });
    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateHostelRoom = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const room = await HostelRoom.findOneAndUpdate(
      { _id: id, school: schoolId, deletedAt: { $exists: false } },
      { ...req.body, updatedBy: req.user._id },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteHostelRoom = async (req, res) => {
  const { id } = req.params;
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const room = await HostelRoom.findOneAndUpdate(
      { _id: id, school: schoolId },
      { deletedAt: new Date(), deletedBy: req.user._id },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
