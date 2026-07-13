import Class from '../models/Class.js';
import ClassSubject from '../models/ClassSubject.js';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { sendNotification } from '../utils/notificationService.js';
import Mark from '../models/Mark.js';
import Exam from '../models/Exam.js';
import Schedule from '../models/Schedule.js';
import ExamSession from '../models/ExamSession.js';
import { logAction } from '../utils/auditLogger.js';

const getScope = (req) => ({
  schoolId: req.user.school?._id || req.user.school,
  branchId: req.branchId || req.user.branch?._id || req.user.branch,
});

// --- View Assigned Classes ---
export const getAssignedClasses = async (req, res) => {
  const { schoolId, branchId } = getScope(req);
  try {
    const query = {
      teacher: req.user._id,
      school: schoolId,
    };
    if (branchId) query.branch = branchId;

    console.log(`[DEBUG] getAssignedClasses: teacher=${req.user._id}, school=${schoolId}, branch=${branchId}`);

    const assignments = await ClassSubject.find(query).populate('class');

    // Get unique classes from assignments
    const classesMap = new Map();
    assignments.forEach(a => {
      if (a.class && !classesMap.has(a.class._id.toString())) {
        classesMap.set(a.class._id.toString(), a.class);
      }
    });

    const allAssignedClasses = Array.from(classesMap.values());
    res.json(allAssignedClasses);
  } catch (error) {
    res.status(500).json({ 
      message: 'An error occurred.',
      userMessage: 'Failed to fetch assigned classes.'
    });
  }
};

// --- Take Attendance ---
export const takeAttendance = async (req, res) => {
  const { classId, subjectId, studentsAttendance, date } = req.body; 
  const { schoolId, branchId } = getScope(req);
  try {
    if (!Array.isArray(studentsAttendance) || studentsAttendance.length === 0) {
      return res.status(400).json({ message: 'studentsAttendance must be a non-empty array.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 1. Check if attendance already exists for this class, subject, and day
    const existingAttendance = await Attendance.findOne({
      class: classId,
      subject: subjectId,
      school: schoolId,
      branch: branchId,
      date: {
        $gte: today,
        $lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      }
    }).sort({ createdAt: 1 }); // Get the earliest record

    if (existingAttendance) {
      const now = new Date();
      const firstMarkedAt = new Date(existingAttendance.createdAt);
      const minutesSinceFirstMarked = (now - firstMarkedAt) / (1000 * 60);

      // If it's been more than 20 minutes, block re-submission until next day
      if (minutesSinceFirstMarked > 20) {
        return res.status(403).json({ 
          message: 'Attendance locked.',
          userMessage: 'Attendance for this subject was marked more than 20 minutes ago and is now locked until tomorrow.'
        });
      }
      
      // If within 20 minutes, we'll replace the existing records for this day/subject/class
      await Attendance.deleteMany({
        class: classId,
        subject: subjectId,
        school: schoolId,
        branch: branchId,
        date: {
          $gte: today,
          $lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
        }
      });
    }

    // 2. Validate subject assignment
    const classSubjectAssignment = await ClassSubject.findOne({
      subject: subjectId,
      class: classId,
      school: schoolId,
      branch: branchId,
    });
    
    if (!classSubjectAssignment) {
      return res.status(400).json({ 
        message: 'Subject is not assigned to this class',
        userMessage: 'This subject is not assigned to the selected class.'
      });
    }

    // 3. Validate teacher assignment
    if (req.user.role === 'teacher') {
      const isAssigned = await ClassSubject.findOne({
        subject: subjectId,
        class: classId,
        teacher: req.user._id,
        school: schoolId,
        branch: branchId,
      });
      if (!isAssigned) {
        return res.status(403).json({ 
          message: 'Not assigned to this subject',
          userMessage: 'You are not assigned to teach this subject in this class.'
        });
      }
    }

    const attendanceRecords = studentsAttendance.map(item => ({
      user: item.studentId,
      date: date || new Date(),
      status: item.status,
      class: classId,
      subject: subjectId,
      school: schoolId,
      branch: branchId,
      markedBy: req.user._id,
    }));

    await Attendance.insertMany(attendanceRecords);

    // Notify Parents of Absentees
    const absentees = attendanceRecords.filter(r => r.status === 'Absent');
    for (const record of absentees) {
      const student = await User.findById(record.user);
      if (student) {
        const title = '🔔 Attendance Alert: Absent';
        const message = `Your child ${student.name} was marked absent today (${new Date(record.date).toLocaleDateString()}).`;
        
        const parents = await User.find({ role: 'parent', linkedStudents: student._id, school: schoolId, branch: branchId });
        for (const parent of parents) {
          await sendNotification({
            recipientId: parent._id,
            schoolId,
            branchId: parent.branch,
            title,
            message,
            type: 'attendance'
          });
        }
      }
    }

    res.status(201).json({ 
      message: 'Attendance recorded successfully',
      userMessage: 'Attendance recorded successfully.'
    });
    logAction(req, { action: 'TAKE_ATTENDANCE', module: 'ATTENDANCE', targetId: classId, details: { subjectId, studentCount: attendanceRecords.length, absentCount: absentees.length } });
  } catch (error) {
    res.status(400).json({ 
      message: 'An error occurred.',
      userMessage: 'Something went wrong. Please try again.'
    });
  }
};

// --- View Class Attendance ---
export const getClassAttendance = async (req, res) => {
  const { classId, subjectId, date } = req.params;
  const { schoolId, branchId } = getScope(req);
  try {
    if (req.user.role === 'teacher') {
      const assignment = await ClassSubject.findOne({
        class: classId,
        teacher: req.user._id,
        school: schoolId,
        branch: branchId,
      });
      if (!assignment) {
        return res.status(403).json({ 
          message: 'You are not assigned to this class',
          userMessage: 'You are not authorized to view attendance for this class.'
        });
      }
    }

    const query = {
      class: classId,
      date: {
        $gte: new Date(new Date(date).setHours(0, 0, 0)),
        $lte: new Date(new Date(date).setHours(23, 59, 59)),
      },
      school: schoolId,
      branch: branchId,
    };

    if (subjectId) {
      query.subject = subjectId;
    }

    const attendance = await Attendance.find(query)
      .populate('user', 'name profileImage')
      .populate('subject', 'name');
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: 'An error occurred.', userMessage: 'Something went wrong. Please try again.' });
  }
};

// --- Submit Marks ---
export const submitMarks = async (req, res) => {
  const { subjectId, classId, examType, studentMarks } = req.body; 
  const { schoolId, branchId } = getScope(req);
  // examType: 'monthly1', 'midterm', 'monthly2', 'final'
  // studentMarks: [{ studentId, score, remarks }]
  try {
    if (!Array.isArray(studentMarks) || studentMarks.length === 0) {
      return res.status(400).json({ message: 'studentMarks must be a non-empty array.' });
    }
    for (const item of studentMarks) {
      if (item.score !== undefined && (isNaN(item.score) || item.score < 0 || item.score > 100)) {
        return res.status(400).json({ message: `Invalid score for student ${item.studentId}. Must be 0-100.` });
      }
    }

    // Validate examType
    const validExams = ['monthly1', 'midterm', 'monthly2', 'final'];
    if (!validExams.includes(examType)) {
      return res.status(400).json({ message: 'Invalid exam type' });
    }

    // Validate if teacher is assigned to the subject
    let actualSubjectId = subjectId;
    if (req.user.role === 'teacher') {
      const isAssigned = await ClassSubject.findOne({
        $or: [
          { subject: subjectId },
          { _id: subjectId }
        ],
        teacher: req.user._id,
        class: classId,
        school: schoolId,
        branch: branchId,
      });
      if (!isAssigned) {
        console.log(`Teacher ${req.user._id} assignment check failed: Subject=${subjectId}, Class=${classId}`);
        return res.status(403).json({ 
          message: 'You are not assigned to this subject in this class',
          userMessage: 'Security Error: You are not authorized to submit marks for this class and subject.'
        });
      }
      // Ensure we use the actual Subject ID for saving marks, not the Assignment ID
      actualSubjectId = isAssigned.subject;
    }

    const termToEnum = {
      'monthly1': 'Monthly1',
      'midterm': 'Midterm',
      'monthly2': 'Monthly2',
      'final': 'Final'
    };
    
    // Validation: Enforce that an admin has explicitly created and published the exam
    // Check for legacy Exam record or modern ExamSession
    let examRecord = await Exam.findOne({
      subject: actualSubjectId,
      class: classId,
      term: termToEnum[examType],
      school: schoolId,
      branch: branchId,
    });

    if (!examRecord) {
      // Check for modern ExamSession
      const termToSessionName = {
        'monthly1': 'Monthly 1',
        'midterm': 'Midterm',
        'monthly2': 'Monthly 2',
        'final': 'Final'
      };
      
      const session = await ExamSession.findOne({
        name: termToSessionName[examType],
        classes: classId,
        subjects: actualSubjectId,
        school: schoolId,
        branch: branchId,
      });

      if (!session) {
        return res.status(403).json({ 
          message: 'No registered exam found for this subject and term. The school admin must register the exam first.',
          userMessage: 'You cannot submit marks because the school admin has not registered this exam yet.'
        });
      }
      
      // If session exists, we treat it as valid
      examRecord = { status: 'Published' }; 
    }

    if (examRecord.status !== 'Published' && examRecord.status !== 'Scheduled' && examRecord.status !== 'Active' && examRecord.status !== 'Completed') {
      return res.status(403).json({ 
        message: 'Exam is registered but not yet ready for grading.',
        userMessage: 'This exam is not yet open for grading.'
      });
    }

    // Update or insert marks for each student
    for (const item of studentMarks) {
      await Mark.findOneAndUpdate(
        { student: item.studentId, subject: actualSubjectId, class: classId, school: schoolId, branch: branchId },
        { 
          $set: {
            [examType]: item.score || 0,
            remarks: item.remarks || '',
            gradedBy: req.user._id,
            school: schoolId,
            student: item.studentId,
            subject: actualSubjectId,
            class: classId,
            branch: branchId
          }
        },
        { upsert: true, new: true }
      );
    }

    res.status(201).json({ message: `Marks for ${examType} submitted/updated successfully` });
    logAction(req, { action: 'SUBMIT_MARKS', module: 'EXAMS', targetId: classId, details: { subjectId, examType, studentCount: studentMarks.length } });
  } catch (error) {
    res.status(400).json({ message: 'Invalid request.', userMessage: 'Your request could not be processed. Please check your input.' });
  }
};

// --- Get existing marks for a class + subject (for pre-filling marks entry) ---
export const getClassSubjectMarks = async (req, res) => {
  const { classId, subjectId } = req.params;
  const { schoolId, branchId } = getScope(req);
  try {
    if (req.user.role === 'teacher') {
      const assignment = await ClassSubject.findOne({
        class: classId,
        subject: subjectId,
        teacher: req.user._id,
        school: schoolId,
        branch: branchId,
      });
      if (!assignment) {
        return res.status(403).json({ 
          message: 'You are not assigned to this subject in this class',
          userMessage: 'You are not authorized to view marks for this class and subject.'
        });
      }
    }

    const marks = await Mark.find({
      class: classId,
      subject: subjectId,
      school: schoolId,
      branch: branchId,
    }).select('student monthly1 midterm monthly2 final remarks');
    // Return as a map: { studentId: { monthly1, midterm, monthly2, final, remarks } }
    const marksMap = {};
    marks.forEach(m => {
      marksMap[m.student.toString()] = {
        monthly1: m.monthly1 || 0,
        midterm: m.midterm || 0,
        monthly2: m.monthly2 || 0,
        final: m.final || 0,
        remarks: m.remarks || ''
      };
    });
    res.json(marksMap);
  } catch (error) {
    res.status(500).json({ message: 'An error occurred.', userMessage: 'Something went wrong. Please try again.' });
  }
};

// --- View Students List ---
export const getStudentsInClass = async (req, res) => {
  const { classId } = req.params;
  const { schoolId, branchId } = getScope(req);
  try {
    if (req.user.role === 'teacher') {
      const assignment = await ClassSubject.findOne({
        class: classId,
        teacher: req.user._id,
        school: schoolId,
        branch: branchId,
      });
      if (!assignment) {
        return res.status(403).json({ 
          message: 'You are not assigned to this class',
          userMessage: 'You are not authorized to view students in this class.'
        });
      }
    }

    const query = { role: 'student', class: classId, school: schoolId };
    if (branchId) query.branch = branchId;
    
    console.log(`[DEBUG] getStudentsInClass: class=${classId}, school=${schoolId}, branch=${branchId}`);

    const students = await User.find(query);
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: 'An error occurred.', userMessage: 'Something went wrong. Please try again.' });
  }
};

// --- View Schedule ---
export const getTeacherSchedule = async (req, res) => {
  const { schoolId, branchId } = getScope(req);
  try {
    const schedules = await Schedule.find({ teacher: req.user._id, school: schoolId, branch: branchId })
      .populate('class', 'name section')
      .populate('subject', 'name code')
      .sort({ day: 1, startTime: 1 });

    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: 'An error occurred.', userMessage: 'Something went wrong. Please try again.' });
  }
};

// --- View Taught Subjects ---
export const getTaughtSubjects = async (req, res) => {
  const { schoolId, branchId } = getScope(req);
  try {
    const rows = await ClassSubject.find({
      teacher: req.user._id,
      school: schoolId,
      branch: branchId,
    }).populate('subject').populate('class');

    const subjects = rows
      .filter((r) => r.subject && r.class)
      .map((r) => ({
        _id: r._id, // USE ASSIGNMENT ID for unique identity per class/subject
        subjectId: r.subject._id,
        name: r.subject.name,
        code: r.subject.code,
        class: r.class,
      }));

    res.json(subjects);
  } catch (error) {
    res.status(500).json({ 
      message: 'An error occurred.',
      userMessage: 'Failed to fetch taught subjects.'
    });
  }
};

// --- View Exams for their subjects ---
export const getExams = async (req, res) => {
  const { schoolId, branchId } = getScope(req);
  try {
    const assignments = await ClassSubject.find({
      teacher: req.user._id,
      school: schoolId,
      branch: branchId,
    });
    
    // Get unique subject-class pairs the teacher is assigned to
    const teacherAssignments = assignments.map(a => ({
      subjectId: String(a.subject),
      classId: String(a.class)
    }));

    if (teacherAssignments.length === 0) {
      return res.json([]);
    }

    // 1. Get legacy individual exams
    const legacyExams = await Exam.find({ 
      school: schoolId,
      branch: branchId,
      status: { $in: ['Published', 'Scheduled', 'Active', 'Completed'] } 
    }).populate('subject').populate('class');

    // 2. Get modern ExamSessions and convert them to virtual Exam objects
    const sessions = await ExamSession.find({
      school: schoolId,
      branch: branchId,
      status: { $in: ['Published', 'Scheduled', 'Active', 'Completed'] }
    }).populate('subjects').populate('classes');

    const sessionExams = [];
    sessions.forEach(session => {
      // Map session name to term format
      const termMap = {
        'Monthly 1': 'Monthly1',
        'Midterm': 'Midterm',
        'Monthly 2': 'Monthly2',
        'Final': 'Final'
      };
      const term = termMap[session.name] || session.name;

      session.classes.forEach(cls => {
        session.subjects.forEach(sub => {
          sessionExams.push({
            _id: `${session._id}-${cls._id}-${sub._id}`,
            name: session.name,
            term: term,
            date: session.date,
            class: cls,
            subject: sub,
            maxMarks: session.maxMarks,
            status: 'Published', // Treat active sessions as published for teachers
            isSession: true,
            sessionId: session._id
          });
        });
      });
    });

    // Combine both
    const allExams = [...legacyExams, ...sessionExams];

    // Filter exams to only show those for subjects/classes assigned to this teacher
    const filteredExams = allExams.filter(exam => {
      const examSubId = String(exam.subject?._id || exam.subject);
      const examClassId = String(exam.class?._id || exam.class);
      
      return teacherAssignments.some(ta => 
        ta.subjectId === examSubId && 
        ta.classId === examClassId
      );
    });

    res.json(filteredExams);
  } catch (error) {
    res.status(500).json({ message: 'An error occurred.', userMessage: 'Something went wrong. Please try again.' });
  }
};

// --- Mark Exam as Present ---
export const markExamAsPresent = async (req, res) => {
  const { examId } = req.params;
  const { schoolId, branchId } = getScope(req);
  try {
    const exam = await Exam.findOne({ _id: examId, school: schoolId, branch: branchId });
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Validate if teacher is assigned to the subject of this exam
    const subject = await ClassSubject.findOne({
      subject: exam.subject,
      class: exam.class,
      teacher: req.user._id,
      school: schoolId,
      branch: branchId,
    });
    if (!subject) {
      return res.status(403).json({ message: 'You are not authorized to manage this exam' });
    }

    exam.status = 'Present';
    await exam.save();
    res.json({ message: 'Exam marked as Present', exam });
    logAction(req, { action: 'MARK_EXAM_PRESENT', module: 'EXAMS', targetId: exam._id });
  } catch (error) {
    res.status(500).json({ message: 'An error occurred.', userMessage: 'Something went wrong. Please try again.' });
  }
};

// --- Request an Exam ---
export const requestExam = async (req, res) => {
  const { name, term, date, classId, subjectId, maxMarks } = req.body;
  const { schoolId, branchId } = getScope(req);
  try {
    // Validate if teacher is assigned to this class and subject
    const isAssigned = await ClassSubject.findOne({
      class: classId,
      subject: subjectId,
      teacher: req.user._id,
      school: schoolId,
      branch: branchId,
    });

    if (!isAssigned) {
      return res.status(403).json({ 
        message: 'Access denied', 
        userMessage: 'You can only request exams for subjects and classes you are assigned to.' 
      });
    }

    const exam = await Exam.create({
      name,
      term,
      date,
      class: classId,
      subject: subjectId,
      maxMarks: maxMarks || 100,
      status: 'Pending',
      requestedBy: req.user._id,
      school: schoolId,
      branch: branchId
    });

    res.status(201).json({
      message: 'Exam request submitted successfully',
      userMessage: 'Your exam request has been submitted for admin approval.',
      exam
    });
    logAction(req, { action: 'REQUEST_EXAM', module: 'EXAMS', targetId: exam._id, details: { name, term, classId, subjectId } });
  } catch (error) {
    res.status(500).json({ message: 'An error occurred.', userMessage: 'Something went wrong. Please try again.' });
  }
};
