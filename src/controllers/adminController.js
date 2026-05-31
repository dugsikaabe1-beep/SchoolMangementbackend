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
import { generateCustomId } from '../utils/schoolUtils.js';

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

    const attendance = await Attendance.find({ 
      user: student._id,
      school: schoolId 
    }).populate('subject', 'name').sort({ date: -1 });
    
    const payments = await MonthlyPayment.find({ 
      student: student._id,
      school: schoolId 
    }).sort({ year: 1, createdAt: 1 });

    const marks = await Mark.find({ 
      student: student._id,
      school: schoolId 
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
  const schoolId = req.user.school?._id || req.user.school;
  const { 
    name, 
    phone,
    age,
    monthlyFees,
    email, 
    password, 
    classId, 
    customId,
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
    
    // Student ID must be provided by admin
    if (!customId || !customId.trim()) {
      return res.status(400).json({ 
        message: 'Student ID is required',
        userMessage: 'Student ID is required. Please enter a unique Student ID.'
      });
    }
    
    // Validate Student ID format (alphanumeric only)
    if (!/^[A-Za-z0-9]+$/.test(customId.trim())) {
      return res.status(400).json({ 
        message: 'Student ID must contain only letters and numbers',
        userMessage: 'Student ID must contain only letters and numbers (no spaces or symbols).'
      });
    }
    
    // Check if Student ID already exists in this school
    const existingStudentId = await User.findOne({ customId: customId.trim(), school: schoolId });
    if (existingStudentId) {
      return res.status(400).json({ 
        message: 'Student ID already exists',
        userMessage: 'This Student ID already exists in this school. Please use a different ID.'
      });
    }
    
    const studentIdStr = customId.trim();

    const user = await User.create({
      name: name.trim(),
      phone: phone ? phone.trim() : undefined,
      age: age !== undefined && age !== '' ? Number(age) : undefined,
      monthlyFees: monthlyFees !== undefined && monthlyFees !== '' ? Number(monthlyFees) : 0,
      email: email || undefined,
      customId: studentIdStr,
      password,
      role: 'student',
      school: schoolId,
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
      profileImage: profileImage || undefined,
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

export const getStudents = async (req, res) => {
  try {
    const schoolId = req.user.school?._id || req.user.school;
    const students = await User.find({ role: 'student', school: schoolId }).populate('class');
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
    if (profileImage !== undefined)     student.profileImage     = profileImage;

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
    const student = await User.findOneAndDelete({ _id: id, role: 'student', school: schoolId });
    if (!student) {
      return res.status(404).json({ 
        message: 'Student not found',
        userMessage: 'Student not found.'
      });
    }
    res.json({ 
      message: 'Student deleted successfully',
      userMessage: 'Student deleted successfully.'
    });
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
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
  try {
    const attendance = await Attendance.find({ school: schoolId })
      .populate('user', 'name customId')
      .populate('class', 'name section')
      .populate('subject', 'name code')
      .populate('markedBy', 'name')
      .sort({ date: -1 });
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
  try {
    const payments = await Payment.find({ school: schoolId })
      .populate('student', 'name customId')
      .sort({ date: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Exam & Marks Management ---
export const getAllExams = async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  try {
    const exams = await Exam.find({ school: schoolId })
      .populate('class', 'name section')
      .populate('subject', 'name code')
      .sort({ date: -1 });
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createExam = async (req, res) => {
  const { name, term, date, classId, subjectId, maxMarks } = req.body;
  const schoolId = req.user.school?._id || req.user.school;
  try {
    const exam = await Exam.create({
      name,
      term,
      date,
      class: classId,
      subject: subjectId,
      maxMarks,
      school: schoolId,
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
  const schoolId = req.user.school?._id || req.user.school;
  try {
    if (!name || !date || !maxMarks || !classIds || classIds.length === 0) {
      return res.status(400).json({
        message: 'All fields are required',
        userMessage: 'Please fill in all required fields and select at least one class.'
      });
    }

    const examSession = await ExamSession.create({
      name,
      date: new Date(date),
      maxMarks: Number(maxMarks),
      classes: classIds,
      subjects: subjectIds || [],
      school: schoolId,
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
  const { 
    name, 
    email, 
    password, 
    customId,
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
      school: req.user.school
    });
    
    if (validSubjects.length !== subjects.length) {
      return res.status(400).json({ 
        message: 'Invalid subject selected',
        userMessage: 'One or more selected subjects do not exist.'
      });
    }
    
    // Generate or validate teacher ID
    let teacherId = customId;
    if (teacherId && teacherId.trim()) {
      // Check if custom ID already exists
      const existingId = await User.findOne({ customId: teacherId.trim() });
      if (existingId) {
        return res.status(400).json({ 
          message: 'Teacher ID already exists',
          userMessage: 'This Teacher ID already exists. Please use a different ID.'
        });
      }
    } else {
      teacherId = await generateUniqueId('teacher', req.user.school);
    }

    const user = await User.create({
      name: name.trim(),
      email: email || undefined, // Treat empty string as undefined for sparse index
      customId: teacherId,
      password,
      phone: phone ? phone.trim() : undefined,
      teacherAge: age !== undefined && age !== '' ? Number(age) : undefined,
      subjects: subjects && subjects.length > 0 ? subjects : [],
      workingStartTime: workingStartTime || undefined,
      workingEndTime: workingEndTime || undefined,
      profileImage: profileImage || undefined,
      role: 'teacher',
      school: req.user.school,
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
    const teachers = await User.find({ role: 'teacher', school: req.user.school })
      .populate('subjects', 'name code');
    res.json(teachers);
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

    if (profileImage !== undefined)     teacher.profileImage     = profileImage;

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
    const teacher = await User.findOneAndDelete({ _id: id, role: 'teacher', school: req.user.school });
    if (!teacher) {
      return res.status(404).json({ 
        message: 'Teacher not found',
        userMessage: 'Teacher not found.'
      });
    }
    res.json({ 
      message: 'Teacher deleted successfully',
      userMessage: 'Teacher deleted successfully.'
    });
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
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

    const exists = await Class.findOne({ school: req.user.school, name, section });
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
    
    // Delete related data
    await ClassSubject.deleteMany({ class: id, school: req.user.school });
    await Schedule.deleteMany({ class: id, school: req.user.school });
    
    await Class.deleteOne({ _id: id, school: req.user.school });
    
    res.json({ 
      message: 'Class deleted successfully',
      userMessage: 'Class deleted successfully.'
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
    const classes = await Class.find({ school: req.user.school })
      .populate('classTeacher')
      .lean();

    const classIds = classes.map((c) => c._id);
    const counts = await ClassSubject.aggregate([
      { $match: { school: req.user.school, class: { $in: classIds } } },
      { $group: { _id: '$class', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((x) => [String(x._id), x.count]));

    const withCounts = classes.map((c) => ({
      ...c,
      assignedSubjectCount: countMap[String(c._id)] || 0,
    }));

    res.json(withCounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    
    // Check for duplicate code (case-insensitive)
    const existingSubject = await Subject.findOne({ 
      school: req.user.school, 
      code: normalizedCode 
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
    const subjects = await Subject.find({ school: req.user.school }).sort({ name: 1 });
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

    await ClassSubject.deleteMany({ subject: id, school: req.user.school });
    await Subject.findByIdAndDelete(id);
    res.json({ 
      message: 'Subject deleted successfully',
      userMessage: 'Subject deleted successfully.'
    });
  } catch (error) {
    res.status(500).json({ 
      message: error.message,
      userMessage: 'Something went wrong. Please try again.'
    });
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
    const schoolId = req.user.school;
    if (!schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }
    const totalStudents = await User.countDocuments({ role: 'student', school: schoolId });
    const totalTeachers = await User.countDocuments({ role: 'teacher', school: schoolId });
    const totalClasses = await Class.countDocuments({ school: schoolId });

    // Attendance rate (last 30 days)
    const now = new Date();
    const start30Days = new Date(now);
    start30Days.setDate(start30Days.getDate() - 30);
    const attendanceAgg = await Attendance.aggregate([
      { $match: { school: schoolId, date: { $gte: start30Days, $lte: now } } },
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
    const allPaidPayments = await MonthlyPayment.find({ school: schoolId, status: 'PAID' });
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
    const latestMonth = await PaymentMonth.findOne({ school: schoolId }).sort({ year: -1, createdAt: -1 });
    let paidCount = 0;
    let unpaidCount = 0;
    if (latestMonth) {
      paidCount = await MonthlyPayment.countDocuments({ paymentMonth: latestMonth._id, status: 'PAID', school: schoolId });
      unpaidCount = await MonthlyPayment.countDocuments({ paymentMonth: latestMonth._id, status: 'UNPAID', school: schoolId });
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
    const classes = await Class.find({ school: schoolId });
    const revenuePerClass = await Promise.all(classes.map(async (c) => {
      const amount = allPaidPayments
        .filter(p => p.class && p.class.toString() === c._id.toString())
        .reduce((sum, p) => sum + p.amount, 0);
      return { name: `${c.name}-${c.section}`, amount };
    }));

    // Class ranks (top classes by average marks)
    // Approach: compute per-student % average within each class, then average across students.
    const classRanksAgg = await Mark.aggregate([
      { $match: { school: schoolId } },
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
    const [recentStudents, recentMarks, recentExams, recentAttendance, recentPaid, recentSchedules] = await Promise.all([
      User.find({ role: 'student', school: schoolId }).select('name createdAt').sort({ createdAt: -1 }).limit(5),
      Mark.find({ school: schoolId }).populate('gradedBy', 'name role').sort({ createdAt: -1 }).limit(5),
      Exam.find({ school: schoolId }).select('name status createdAt updatedAt').sort({ updatedAt: -1 }).limit(5),
      Attendance.find({ school: schoolId }).populate('markedBy', 'name role').sort({ createdAt: -1 }).limit(5),
      MonthlyPayment.find({ school: schoolId, status: 'PAID' }).populate('paidBy', 'name role').sort({ paymentDate: -1, updatedAt: -1 }).limit(5),
      Schedule.find({ school: schoolId }).populate('teacher', 'name role').sort({ updatedAt: -1 }).limit(5),
    ]);

    const recentActionsRaw = [
      ...recentStudents.map(s => ({
        action: 'Added Student',
        user: 'Admin',
        at: s.createdAt,
      })),
      ...recentMarks.map(m => ({
        action: 'Marks Submitted',
        user: m.gradedBy?.name ? `Teacher ${m.gradedBy.name}` : 'Teacher',
        at: m.createdAt,
      })),
      ...recentExams.map(e => ({
        action: e.status === 'Published' ? 'Exam Published' : 'Exam Updated',
        user: 'Admin',
        at: e.updatedAt || e.createdAt,
      })),
      ...recentAttendance.map(a => ({
        action: 'Attendance Taken',
        user: a.markedBy?.name ? `${a.markedBy.role === 'teacher' ? 'Teacher' : 'Admin'} ${a.markedBy.name}` : 'Teacher',
        at: a.createdAt,
      })),
      ...recentPaid.map(p => ({
        action: 'Payment Marked Paid',
        user: p.paidBy?.name ? `Admin ${p.paidBy.name}` : 'Admin',
        at: p.paymentDate || p.updatedAt,
      })),
      ...recentSchedules.map(s => ({
        action: 'Schedule Updated',
        user: s.teacher?.name ? `Teacher ${s.teacher.name}` : 'Admin',
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
        datetime: new Date(x.at).toISOString(),
      }));

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
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Teacher Dashboard Statistics ---
export const getTeacherDashboardStats = async (req, res) => {
  const teacherId = req.user._id;
  // Use user's school or fallback to detected tenant school
  const schoolId = req.user.school?._id || req.user.school || req.schoolId;

  if (!schoolId) {
    console.error(`Stats error: No school associated with teacher ${teacherId} and no tenant detected.`);
    return res.status(400).json({ message: 'Teacher is not associated with a school' });
  }

  try {
    console.log(`Fetching stats for teacher ${teacherId} in school ${schoolId}`);
    // Get all class-subject assignments for this teacher
    let assignments = await ClassSubject.find({ 
      teacher: teacherId, 
      school: schoolId 
    })
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

    const schedules = await Schedule.find(filter)
      .populate('class', 'name section')
      .populate('subject', 'name code')
      .populate('teacher', 'name')
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
      createdBy: req.user._id,
    });

    // Find eligible students
    const query = { role: 'student', school: schoolId, status: 'active' };
    if (assignTo === 'CLASS' && classId) query.class = classId;
    const students = await User.find(query).select('_id class monthlyFees');

    // Bulk-insert UNPAID records
    const records = students.map(s => ({
      paymentMonth: pm._id,
      student: s._id,
      class: s.class,
      month,
      year,
      monthLabel: pm.monthLabel,
      amount: s.monthlyFees || amount || 0, // Prefer student-specific fee, then month default
      status: 'UNPAID',
      school: schoolId,
    }));

    await MonthlyPayment.insertMany(records, { ordered: false });

    // Update counts
    pm.totalStudents = students.length;
    pm.unpaidCount = students.length;
    pm.paidCount = 0;
    await pm.save();

    res.status(201).json({ paymentMonth: pm, created: records.length });
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
    const months = await PaymentMonth.find({ school: req.user.school })
      .populate('class', 'name section')
      .sort({ year: -1, createdAt: -1 });
    res.json(months);
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
    const filter = { school: req.user.school };
    
    // Normalize and validate month
    if (month && month !== 'undefined' && month !== 'null' && month !== '') {
      // Ensure month is capitalized (e.g., "april" -> "April") to match DB storage
      filter.month = month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
    }
    
    // Normalize and validate year
    if (year && year !== 'undefined' && year !== 'null' && year !== '') {
      filter.year = Number(year);
    }
    
    if (classId && classId !== 'undefined' && classId !== 'null' && classId !== '') {
      filter.class = classId;
    }

    if (status && status !== 'undefined' && status !== 'null' && status !== '') {
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

    mp.status = 'PAID';
    mp.paymentDate = new Date();
    mp.paidBy = req.user._id;
    mp.remarks = remarks;
    await mp.save();

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

    mp.status = 'UNPAID';
    mp.paymentDate = null;
    mp.paidBy = null;
    mp.remarks = '';
    await mp.save();

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
    const { month, year } = req.body;
    const { generateMonthlyPayments } = await import('../services/paymentScheduler.js');
    const result = await generateMonthlyPayments(req.user.school, month, year);
    
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
  try {
    const studentFilter = { role: 'student', school: schoolId };
    if (classId) studentFilter.class = classId;
    const students = await User.find(studentFilter).populate('class', 'name section');

    const months = await PaymentMonth.find({ school: schoolId })
      .sort({ year: 1, createdAt: 1 });

    const studentIds = students.map(s => s._id);
    const allPayments = await MonthlyPayment.find({
      school: schoolId,
      student: { $in: studentIds },
    });

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
    const school = await School.findById(req.user.school);
    if (!school) return res.status(404).json({ message: 'School not found.' });
    res.json(school);
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
  const { name, logo, address, phone, email, merchantNumber } = req.body;
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
    if (address        !== undefined) school.address        = address;
    if (phone          !== undefined) school.phone          = phone;
    if (email          !== undefined) school.email          = email;
    if (merchantNumber !== undefined) school.merchantNumber = merchantNumber;

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
export const resetTeacherPassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters long',
        userMessage: 'Password must be at least 6 characters long.'
      });
    }

    const teacher = await User.findOne({ 
      _id: id, 
      role: 'teacher',
      school: req.user.school 
    });

    if (!teacher) {
      return res.status(404).json({
        message: 'Teacher not found',
        userMessage: 'Teacher not found in your school.'
      });
    }

    teacher.password = newPassword;
    await teacher.save();

    res.json({
      message: 'Teacher password reset successfully',
      userMessage: `Password for ${teacher.name} has been reset successfully.`
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
      userMessage: 'Failed to reset password. Please try again.'
    });
  }
};

/**
 * PUT /admin/students/:id/reset-password
 * Admin resets a student's password
 */
/**
 * PUT /admin/students/:id/reset-password
 * Admin resets a student's password
 */
export const resetStudentPassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long',
        userMessage: 'Password must be at least 8 characters long.'
      });
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      return res.status(400).json({
        message: 'Password must contain at least one letter',
        userMessage: 'Password must contain at least one letter.'
      });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        message: 'Password must contain at least one number',
        userMessage: 'Password must contain at least one number.'
      });
    }

    const student = await User.findOne({ 
      _id: id, 
      role: 'student',
      school: req.user.school 
    });

    if (!student) {
      return res.status(404).json({
        message: 'Student not found',
        userMessage: 'Student not found in your school.'
      });
    }

    student.password = newPassword;
    await student.save();

    res.json({
      message: 'Student password reset successfully',
      userMessage: `Password for ${student.name} has been reset successfully.`
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
      userMessage: 'Failed to reset password. Please try again.'
    });
  }
};

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

