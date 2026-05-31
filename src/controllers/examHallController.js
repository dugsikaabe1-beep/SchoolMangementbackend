import asyncHandler from 'express-async-handler';
import ExamHall from '../models/ExamHall.js';
import User from '../models/User.js';
import MonthlyPayment from '../models/MonthlyPayment.js';
import mongoose from 'mongoose';

// @desc    Get all exam halls for a school
// @route   GET /api/school-admin/exam-halls
// @access  Private (School Admin, Teacher, Student)
export const getExamHalls = asyncHandler(async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  
  let query = { school: schoolId };
  
  // If teacher, strictly filter to halls they supervise
  if (req.user.role === 'teacher') {
    query.supervisors = req.user._id;
  }

  // If student, strictly filter to halls they are assigned to
  if (req.user.role === 'student') {
    query['students.student'] = req.user._id;
  }

  const halls = await ExamHall.find(query)
    .populate('supervisors', 'name customId')
    .sort({ examDate: 1, examSession: 1 });

  res.json(halls);
});

// @desc    Get single exam hall details with student payment status
// @route   GET /api/school-admin/exam-halls/:id
// @access  Private (School Admin, Teacher)
export const getExamHallById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;

  let query = { _id: id, school: schoolId };

  // Strict access control for teachers and students
  if (req.user.role === 'teacher') {
    query.supervisors = req.user._id;
  } else if (req.user.role === 'student') {
    query['students.student'] = req.user._id;
  }

  const hall = await ExamHall.findOne(query)
    .populate('supervisors', 'name customId')
    .populate('students.student', 'name customId email class temporaryExamAccess temporaryAccessExpiresAt temporaryAccessReason temporaryAccessGrantedBy');

  if (!hall) {
    res.status(403);
    throw new Error('Access denied or hall not found');
  }

  // Check payment status for each student
  const studentsWithStatus = await Promise.all(hall.students.map(async (item) => {
    if (!item.student) return item;

    const studentId = item.student._id;
    let studentObj = typeof item.student.toObject === 'function' ? item.student.toObject() : item.student;

    // --- Automatic Expiry Logic ---
    // If student has temporary access but it has expired, revoke it automatically
    if (studentObj.temporaryExamAccess && studentObj.temporaryAccessExpiresAt) {
      const now = new Date();
      if (now > new Date(studentObj.temporaryAccessExpiresAt)) {
        await User.findByIdAndUpdate(studentId, {
          temporaryExamAccess: false,
          $set: { 'temporaryAccessHistory.$[elem].status': 'expired' }
        }, {
          arrayFilters: [{ 'elem.status': 'active' }]
        });
        studentObj.temporaryExamAccess = false;
      }
    }

    // Check if student has any UNPAID monthly payments for the current year
    const currentYear = new Date().getFullYear();
    const unpaidPayments = await MonthlyPayment.find({
      student: studentId,
      school: schoolId,
      status: 'UNPAID',
      year: { $lte: currentYear } // Check current and past years
    });

    // Determine final clearance status
    // A student is cleared if:
    // 1. They have no unpaid payments
    // 2. OR they have active temporary exam access (even if they have debt)
    const isCleared = unpaidPayments.length === 0 || studentObj.temporaryExamAccess;
    
    // Sanitize data based on role (Teachers shouldn't see financial details)
    const sanitizedStudent = {
      _id: studentObj._id,
      name: studentObj.name,
      customId: studentObj.customId,
      class: studentObj.class,
      isCleared: isCleared,
      isTemporarilyCleared: studentObj.temporaryExamAccess,
      temporaryAccessExpiresAt: studentObj.temporaryAccessExpiresAt,
      temporaryAccessReason: studentObj.temporaryAccessReason
    };

    // Only Admins see the debt details
    if (req.user.role === 'schooladmin') {
      sanitizedStudent.hasOwedMoney = unpaidPayments.length > 0;
      sanitizedStudent.unpaidCount = unpaidPayments.length;
    }
    
    return {
      ...item.toObject(),
      student: sanitizedStudent
    };
  }));

  res.json({
    ...hall.toObject(),
    students: studentsWithStatus
  });
});

// @desc    Create exam hall
// @route   POST /api/school-admin/exam-halls
// @access  Private (School Admin)
export const createExamHall = asyncHandler(async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  const { name, capacity, examDate, examSession, supervisors } = req.body;

  if (!name || !capacity || !examDate) {
    res.status(400);
    throw new Error('Please provide all required fields (name, capacity, examDate)');
  }

  // Check for duplicate hall name on same date/session
  const startOfDay = new Date(examDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(examDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const existingHall = await ExamHall.findOne({
    school: schoolId,
    name,
    examDate: { $gte: startOfDay, $lte: endOfDay },
    examSession
  });

  if (existingHall) {
    res.status(400);
    throw new Error(`A hall named "${name}" already exists for this date and session.`);
  }

  // Check if any supervisor is already assigned to another hall on the same date and session
  if (supervisors && supervisors.length > 0) {
    const assignedSupervisorHall = await ExamHall.findOne({
      school: schoolId,
      examDate: { $gte: startOfDay, $lte: endOfDay },
      examSession, // Check same session
      supervisors: { $in: supervisors }
    });

    if (assignedSupervisorHall) {
      res.status(400);
      const sessionText = examSession ? `the ${examSession} session` : 'this session';
      throw new Error(`One or more supervisors are already assigned to ${assignedSupervisorHall.name} for ${sessionText} on this date. A teacher cannot supervise in two different halls at the same time.`);
    }
  }

  const hall = await ExamHall.create({
    school: schoolId,
    name,
    capacity,
    examDate,
    examSession,
    supervisors: supervisors || []
  });

  res.status(201).json({
    message: 'Exam hall created successfully',
    userMessage: 'Exam hall created successfully',
    hall
  });
});

// @desc    Update exam hall
// @route   PUT /api/school-admin/exam-halls/:id
// @access  Private (School Admin)
export const updateExamHall = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  const { name, capacity, examDate, examSession, supervisors } = req.body;

  const hall = await ExamHall.findOne({ _id: id, school: schoolId });

  if (!hall) {
    res.status(404);
    throw new Error('Exam hall not found');
  }

  if (capacity && Number(capacity) < hall.students.length) {
    res.status(400);
    throw new Error(`Capacity cannot be less than the number of currently assigned students (${hall.students.length})`);
  }

  // Check if any supervisor is already assigned to another hall on the same date and session
  if (supervisors && supervisors.length > 0) {
    const targetDate = examDate ? new Date(examDate) : hall.examDate;
    const targetSession = examSession || hall.examSession;
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const assignedSupervisorHall = await ExamHall.findOne({
      school: schoolId,
      _id: { $ne: id },
      examDate: { $gte: startOfDay, $lte: endOfDay },
      examSession: targetSession, // Check same session
      supervisors: { $in: supervisors }
    });

    if (assignedSupervisorHall) {
      res.status(400);
      throw new Error(`One or more supervisors are already assigned to ${assignedSupervisorHall.name} for the ${targetSession} session on this date. A teacher cannot supervise in two different halls at the same time.`);
    }
  }

  hall.name = name || hall.name;
  hall.capacity = capacity || hall.capacity;
  hall.examDate = examDate || hall.examDate;
  hall.examSession = examSession || hall.examSession;
  if (supervisors) hall.supervisors = supervisors;

  await hall.save();

  res.json({
    message: 'Exam hall updated successfully',
    userMessage: 'Exam hall updated successfully',
    hall
  });
});

// @desc    Grant temporary exam clearance to a student
// @route   POST /api/school-admin/exam-halls/temporary-clearance
// @access  Private (School Admin)
export const grantTemporaryClearance = asyncHandler(async (req, res) => {
  const { studentId, expiresAt, reason } = req.body;
  const schoolId = req.user.school?._id || req.user.school;

  if (!studentId || !expiresAt) {
    res.status(400);
    throw new Error('Please provide studentId and expiry date');
  }

  const student = await User.findOne({ _id: studentId, school: schoolId });
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  // Update student temporary access fields
  student.temporaryExamAccess = true;
  student.temporaryAccessExpiresAt = expiresAt;
  student.temporaryAccessReason = reason || '';
  student.temporaryAccessGrantedBy = req.user.name;

  // Add to history
  student.temporaryAccessHistory.push({
    grantedBy: req.user.name,
    expiresAt,
    reason,
    status: 'active'
  });

  await student.save();

  res.json({
    message: 'Temporary exam clearance granted successfully',
    userMessage: 'Temporary exam clearance granted successfully',
    student
  });
});

// @desc    Revoke temporary exam clearance from a student
// @route   POST /api/school-admin/exam-halls/revoke-clearance
// @access  Private (School Admin)
export const revokeTemporaryClearance = asyncHandler(async (req, res) => {
  const { studentId } = req.body;
  const schoolId = req.user.school?._id || req.user.school;

  const student = await User.findOne({ _id: studentId, school: schoolId });
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  student.temporaryExamAccess = false;
  
  // Update active history item to revoked
  if (student.temporaryAccessHistory && student.temporaryAccessHistory.length > 0) {
    const activeItem = student.temporaryAccessHistory.find(item => item.status === 'active');
    if (activeItem) {
      activeItem.status = 'revoked';
    }
  }

  await student.save();

  res.json({
    message: 'Temporary exam clearance revoked successfully',
    userMessage: 'Temporary exam clearance revoked successfully',
    student
  });
});

// @desc    Delete exam hall
// @route   DELETE /api/school-admin/exam-halls/:id
// @access  Private (School Admin)
export const deleteExamHall = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;

  const hall = await ExamHall.findOneAndDelete({ _id: id, school: schoolId });

  if (!hall) {
    res.status(404);
    throw new Error('Exam hall not found');
  }

  res.json({
    message: 'Exam hall deleted successfully',
    userMessage: 'Exam hall deleted successfully'
  });
});

// @desc    Assign students to hall (Bulk)
// @route   POST /api/school-admin/exam-halls/:id/assign-student
// @access  Private (School Admin)
export const assignStudentToHall = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { studentIds, seatPrefix } = req.body; // Expecting array of studentIds and optional seatPrefix
  const schoolId = req.user.school?._id || req.user.school;

  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400);
    throw new Error('Please select at least one student');
  }

  const hall = await ExamHall.findOne({ _id: id, school: schoolId });

  if (!hall) {
    res.status(404);
    throw new Error('Exam hall not found');
  }

  // Check capacity
  if (hall.students.length + studentIds.length > hall.capacity) {
    res.status(400);
    throw new Error(`Exam hall capacity exceeded. Available spots: ${hall.capacity - hall.students.length}`);
  }

  const startOfDay = new Date(hall.examDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(hall.examDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const removedFromHalls = [];

  // Process each student
  for (const studentId of studentIds) {
    // Check if student is already in this hall
    const isAssignedToThisHall = hall.students.find(s => s.student.toString() === studentId);
    if (isAssignedToThisHall) continue; // Skip if already here

    // Check if student is already assigned to ANY OTHER hall for the same date and session
    const otherHall = await ExamHall.findOne({
      school: schoolId,
      _id: { $ne: id },
      examDate: { $gte: startOfDay, $lte: endOfDay },
      examSession: hall.examSession,
      'students.student': studentId
    });

    // If student is in another hall, remove them from that hall
    if (otherHall) {
      otherHall.students = otherHall.students.filter(s => s.student.toString() !== studentId);
      await otherHall.save();
      removedFromHalls.push({
        studentId,
        previousHall: otherHall.name,
        previousHallId: otherHall._id
      });
    }

    // Auto-generate seat number based on current count + prefix
    const nextSeatNum = hall.students.length + 1;
    const seatNumber = seatPrefix ? `${seatPrefix}-${nextSeatNum}` : `${nextSeatNum}`;

    hall.students.push({ student: studentId, seatNumber });
  }

  await hall.save();

  res.json({
    message: 'Students assigned to hall successfully',
    userMessage: 'Students assigned to hall successfully',
    hall,
    removedFromHalls: removedFromHalls.length > 0 ? removedFromHalls : undefined
  });
});

// @desc    Remove student from hall
// @route   DELETE /api/school-admin/exam-halls/:id/students/:studentId
// @access  Private (School Admin)
export const removeStudentFromHall = asyncHandler(async (req, res) => {
  const { id, studentId } = req.params;
  const schoolId = req.user.school?._id || req.user.school;

  const hall = await ExamHall.findOne({ _id: id, school: schoolId });

  if (!hall) {
    res.status(404);
    throw new Error('Exam hall not found');
  }

  hall.students = hall.students.filter(s => s.student.toString() !== studentId);
  await hall.save();

  res.json({
    message: 'Student removed from hall successfully',
    userMessage: 'Student removed from hall successfully',
    hall
  });
});

// @desc    Get available students for hall assignment with search and class filter
// @route   GET /api/school-admin/exam-halls/available-students
// @access  Private (School Admin)
export const getAvailableStudentsForHall = asyncHandler(async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  const { search, classId, hallId } = req.query;

  // Build base query for active students
  let query = {
    school: schoolId,
    role: 'student',
    status: 'active'
  };

  // Add search filter (by name or customId)
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { customId: { $regex: search, $options: 'i' } }
    ];
  }

  // Add class filter
  if (classId) {
    query.class = classId;
  }

  // Get students matching the query
  let students = await User.find(query)
    .populate('class', 'name section')
    .sort({ name: 1 });

  // If hallId is provided, exclude students already assigned to this hall
  if (hallId) {
    const hall = await ExamHall.findOne({ _id: hallId, school: schoolId });
    if (hall) {
      const assignedStudentIds = hall.students.map(s => s.student.toString());
      students = students.filter(s => !assignedStudentIds.includes(s._id.toString()));
    }
  }

  res.json({
    students,
    total: students.length
  });
});
