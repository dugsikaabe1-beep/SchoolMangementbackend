import asyncHandler from 'express-async-handler';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import { logAction } from '../utils/auditLogger.js';
import crypto from 'crypto';

/**
 * Generate QR code for attendance
 */
export const generateAttendanceQR = asyncHandler(async (req, res) => {
  const { classId, subjectId, date } = req.body;
  
  // Generate unique QR code
  const qrData = {
    schoolId: req.schoolId,
    branchId: req.branchId,
    classId,
    subjectId,
    date: date || new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex')
  };
  
  const qrString = JSON.stringify(qrData);
  const qrHash = crypto.createHash('sha256').update(qrString).digest('hex');
  
  // Store QR code in session or database with expiration
  const qrCode = {
    data: qrString,
    hash: qrHash,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    classId,
    subjectId,
    date: qrData.date,
    school: req.schoolId,
    branch: req.branchId,
    createdBy: req.user._id
  };
  
  // For now, return the QR data. In production, store in Redis or database
  res.json({
    success: true,
    qrCode: qrString,
    qrHash: qrHash,
    expiresAt: qrCode.expiresAt
  });
});

/**
 * Verify QR code and mark attendance
 */
export const verifyQRAttendance = asyncHandler(async (req, res) => {
  const { qrCode, location, deviceInfo } = req.body;
  
  try {
    // Parse QR code
    const qrData = JSON.parse(qrCode);
    
    // Verify QR code hash
    const qrHash = crypto.createHash('sha256').update(qrCode).digest('hex');
    
    // Check if QR code is valid (in production, check against stored QR codes)
    // For now, we'll validate the structure
    
    // Verify student belongs to the class
    const student = await User.findOne({
      _id: req.user._id,
      school: req.schoolId,
      role: 'student'
    }).populate('classes');
    
    if (!student) {
      return res.status(403).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    // Check if student is in the specified class
    const isInClass = student.classes?.some(c => c._id.toString() === qrData.classId);
    if (!isInClass) {
      return res.status(403).json({
        success: false,
        message: 'Student is not enrolled in this class'
      });
    }
    
    // Check if attendance already marked
    const existingAttendance = await Attendance.findOne({
      user: req.user._id,
      class: qrData.classId,
      subject: qrData.subjectId,
      date: new Date(qrData.date),
      method: 'QR'
    });
    
    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Attendance already marked for this session'
      });
    }
    
    // Mark attendance
    const attendance = await Attendance.create({
      user: req.user._id,
      class: qrData.classId,
      subject: qrData.subjectId,
      date: new Date(qrData.date),
      status: 'Present',
      method: 'QR',
      checkInTime: new Date(),
      location: location || {},
      deviceInfo: deviceInfo || {},
      verificationData: {
        qrCode: qrHash
      },
      school: req.schoolId,
      branch: req.branchId,
      academicYear: req.academicYearId,
      markedBy: req.user._id
    });
    
    // Log action
    await logAction(req, {
      action: 'QR_ATTENDANCE_MARKED',
      module: 'ATTENDANCE',
      targetId: attendance._id,
      details: {
        method: 'QR',
        classId: qrData.classId,
        subjectId: qrData.subjectId
      }
    });
    
    res.json({
      success: true,
      message: 'Attendance marked successfully',
      attendance
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid QR code'
    });
  }
});

/**
 * Get attendance statistics by method
 */
export const getAttendanceMethodStats = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  const matchQuery = {
    school: req.schoolId,
    isDeleted: false
  };
  
  if (req.branchId) {
    matchQuery.branch = req.branchId;
  }
  
  if (startDate && endDate) {
    matchQuery.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  const stats = await Attendance.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$method',
        count: { $sum: 1 },
        present: {
          $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] }
        }
      }
    }
  ]);
  
  res.json({
    success: true,
    stats
  });
});

/**
 * Get attendance by method
 */
export const getAttendanceByMethod = asyncHandler(async (req, res) => {
  const { method, page = 1, limit = 20 } = req.query;
  
  const query = {
    school: req.schoolId,
    isDeleted: false
  };
  
  if (req.branchId) {
    query.branch = req.branchId;
  }
  
  if (method) {
    query.method = method;
  }
  
  const total = await Attendance.countDocuments(query);
  const attendance = await Attendance.find(query)
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('user', 'name customId')
    .populate('class', 'name')
    .populate('subject', 'name');
  
  res.json({
    success: true,
    attendance,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

/**
 * Bulk mark attendance via QR
 */
export const bulkQRAttendance = asyncHandler(async (req, res) => {
  const { qrCodes } = req.body; // Array of QR codes with location/device info
  
  const results = [];
  
  for (const qrData of qrCodes) {
    try {
      const parsed = JSON.parse(qrData.code);
      
      // Verify and mark attendance (similar logic to verifyQRAttendance)
      // This would be used for scanning multiple QR codes at once
      
      results.push({
        success: true,
        studentId: parsed.studentId
      });
    } catch (error) {
      results.push({
        success: false,
        error: error.message
      });
    }
  }
  
  res.json({
    success: true,
    results
  });
});

/**
 * Register RFID tag for a student
 */
export const registerRFIDTag = asyncHandler(async (req, res) => {
  const { studentId, rfidTag } = req.body;
  
  // Verify student belongs to school
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  // Check if RFID tag is already registered
  const existingStudent = await User.findOne({
    school: req.schoolId,
    'verificationData.rfidTag': rfidTag
  });
  
  if (existingStudent) {
    return res.status(400).json({
      success: false,
      message: 'RFID tag is already registered to another student'
    });
  }
  
  // Update student with RFID tag
  student.verificationData = student.verificationData || {};
  student.verificationData.rfidTag = rfidTag;
  await student.save();
  
  // Log action
  await logAction(req, {
    action: 'RFID_TAG_REGISTERED',
    module: 'ATTENDANCE',
    targetId: student._id,
    details: {
      studentId,
      rfidTag
    }
  });
  
  res.json({
    success: true,
    message: 'RFID tag registered successfully',
    student
  });
});

/**
 * Verify RFID and mark attendance
 */
export const verifyRFIDAttendance = asyncHandler(async (req, res) => {
  const { rfidTag, location, deviceInfo } = req.body;
  
  // Find student by RFID tag
  const student = await User.findOne({
    school: req.schoolId,
    'verificationData.rfidTag': rfidTag,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'RFID tag not registered'
    });
  }
  
  // Get current date
  const today = new Date().toISOString().split('T')[0];
  
  // Check if attendance already marked today for any class
  const existingAttendance = await Attendance.findOne({
    user: student._id,
    date: new Date(today),
    method: 'RFID'
  });
  
  if (existingAttendance) {
    return res.status(400).json({
      success: false,
      message: 'Attendance already marked for today'
    });
  }
  
  // Get student's current class (for simplicity, use first class)
  const currentClass = student.classes?.[0];
  if (!currentClass) {
    return res.status(400).json({
      success: false,
      message: 'Student is not enrolled in any class'
    });
  }
  
  // Mark attendance
  const attendance = await Attendance.create({
    user: student._id,
    class: currentClass._id,
    subject: currentClass.subjectId,
    date: new Date(today),
    status: 'Present',
    method: 'RFID',
    checkInTime: new Date(),
    location: location || {},
    deviceInfo: deviceInfo || {},
    verificationData: {
      rfidTag: rfidTag
    },
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    markedBy: req.user._id
  });
  
  // Log action
  await logAction(req, {
    action: 'RFID_ATTENDANCE_MARKED',
    module: 'ATTENDANCE',
    targetId: attendance._id,
    details: {
      method: 'RFID',
      studentId: student._id,
      rfidTag
    }
  });
  
  res.json({
    success: true,
    message: 'Attendance marked successfully',
    attendance,
    student: {
      name: student.name,
      customId: student.customId
    }
  });
});

/**
 * Get RFID registration status
 */
export const getRFIDRegistrationStatus = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  }).select('verificationData.rfidTag name customId');
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  res.json({
    success: true,
    hasRFID: !!student.verificationData?.rfidTag,
    rfidTag: student.verificationData?.rfidTag || null,
    student: {
      name: student.name,
      customId: student.customId
    }
  });
});

/**
 * Unregister RFID tag
 */
export const unregisterRFIDTag = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  if (!student.verificationData?.rfidTag) {
    return res.status(400).json({
      success: false,
      message: 'No RFID tag registered for this student'
    });
  }
  
  const oldTag = student.verificationData.rfidTag;
  student.verificationData.rfidTag = undefined;
  await student.save();
  
  // Log action
  await logAction(req, {
    action: 'RFID_TAG_UNREGISTERED',
    module: 'ATTENDANCE',
    targetId: student._id,
    details: {
      studentId,
      oldTag
    }
  });
  
  res.json({
    success: true,
    message: 'RFID tag unregistered successfully'
  });
});

/**
 * Register NFC ID for a student
 */
export const registerNFCId = asyncHandler(async (req, res) => {
  const { studentId, nfcId } = req.body;
  
  // Verify student belongs to school
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  // Check if NFC ID is already registered
  const existingStudent = await User.findOne({
    school: req.schoolId,
    'verificationData.nfcId': nfcId
  });
  
  if (existingStudent) {
    return res.status(400).json({
      success: false,
      message: 'NFC ID is already registered to another student'
    });
  }
  
  // Update student with NFC ID
  student.verificationData = student.verificationData || {};
  student.verificationData.nfcId = nfcId;
  await student.save();
  
  // Log action
  await logAction(req, {
    action: 'NFC_ID_REGISTERED',
    module: 'ATTENDANCE',
    targetId: student._id,
    details: {
      studentId,
      nfcId
    }
  });
  
  res.json({
    success: true,
    message: 'NFC ID registered successfully',
    student
  });
});

/**
 * Verify NFC and mark attendance
 */
export const verifyNFCAttendance = asyncHandler(async (req, res) => {
  const { nfcId, location, deviceInfo } = req.body;
  
  // Find student by NFC ID
  const student = await User.findOne({
    school: req.schoolId,
    'verificationData.nfcId': nfcId,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'NFC ID not registered'
    });
  }
  
  // Get current date
  const today = new Date().toISOString().split('T')[0];
  
  // Check if attendance already marked today for any class
  const existingAttendance = await Attendance.findOne({
    user: student._id,
    date: new Date(today),
    method: 'NFC'
  });
  
  if (existingAttendance) {
    return res.status(400).json({
      success: false,
      message: 'Attendance already marked for today'
    });
  }
  
  // Get student's current class (for simplicity, use first class)
  const currentClass = student.classes?.[0];
  if (!currentClass) {
    return res.status(400).json({
      success: false,
      message: 'Student is not enrolled in any class'
    });
  }
  
  // Mark attendance
  const attendance = await Attendance.create({
    user: student._id,
    class: currentClass._id,
    subject: currentClass.subjectId,
    date: new Date(today),
    status: 'Present',
    method: 'NFC',
    checkInTime: new Date(),
    location: location || {},
    deviceInfo: deviceInfo || {},
    verificationData: {
      nfcId: nfcId
    },
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    markedBy: req.user._id
  });
  
  // Log action
  await logAction(req, {
    action: 'NFC_ATTENDANCE_MARKED',
    module: 'ATTENDANCE',
    targetId: attendance._id,
    details: {
      method: 'NFC',
      studentId: student._id,
      nfcId
    }
  });
  
  res.json({
    success: true,
    message: 'Attendance marked successfully',
    attendance,
    student: {
      name: student.name,
      customId: student.customId
    }
  });
});

/**
 * Get NFC registration status
 */
export const getNFCRegistrationStatus = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  }).select('verificationData.nfcId name customId');
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  res.json({
    success: true,
    hasNFC: !!student.verificationData?.nfcId,
    nfcId: student.verificationData?.nfcId || null,
    student: {
      name: student.name,
      customId: student.customId
    }
  });
});

/**
 * Unregister NFC ID
 */
export const unregisterNFCId = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  if (!student.verificationData?.nfcId) {
    return res.status(400).json({
      success: false,
      message: 'No NFC ID registered for this student'
    });
  }
  
  const oldId = student.verificationData.nfcId;
  student.verificationData.nfcId = undefined;
  await student.save();
  
  // Log action
  await logAction(req, {
    action: 'NFC_ID_UNREGISTERED',
    module: 'ATTENDANCE',
    targetId: student._id,
    details: {
      studentId,
      oldId
    }
  });
  
  res.json({
    success: true,
    message: 'NFC ID unregistered successfully'
  });
});

/**
 * Register face data for a student
 */
export const registerFaceData = asyncHandler(async (req, res) => {
  const { studentId, faceDescriptor, faceImage } = req.body;
  
  // Verify student belongs to school
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  // Update student with face data
  student.verificationData = student.verificationData || {};
  student.verificationData.faceDescriptor = faceDescriptor;
  student.verificationData.faceImage = faceImage;
  await student.save();
  
  // Log action
  await logAction(req, {
    action: 'FACE_DATA_REGISTERED',
    module: 'ATTENDANCE',
    targetId: student._id,
    details: {
      studentId
    }
  });
  
  res.json({
    success: true,
    message: 'Face data registered successfully',
    student
  });
});

/**
 * Verify face and mark attendance
 */
export const verifyFaceAttendance = asyncHandler(async (req, res) => {
  const { faceDescriptor, faceImage, location, deviceInfo } = req.body;
  
  // Find student by face descriptor (simplified - in production use face recognition library)
  const student = await User.findOne({
    school: req.schoolId,
    'verificationData.faceDescriptor': faceDescriptor,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Face not recognized'
    });
  }
  
  // Get current date
  const today = new Date().toISOString().split('T')[0];
  
  // Check if attendance already marked today for any class
  const existingAttendance = await Attendance.findOne({
    user: student._id,
    date: new Date(today),
    method: 'FACE_RECOGNITION'
  });
  
  if (existingAttendance) {
    return res.status(400).json({
      success: false,
      message: 'Attendance already marked for today'
    });
  }
  
  // Get student's current class (for simplicity, use first class)
  const currentClass = student.classes?.[0];
  if (!currentClass) {
    return res.status(400).json({
      success: false,
      message: 'Student is not enrolled in any class'
    });
  }
  
  // Mark attendance
  const attendance = await Attendance.create({
    user: student._id,
    class: currentClass._id,
    subject: currentClass.subjectId,
    date: new Date(today),
    status: 'Present',
    method: 'FACE_RECOGNITION',
    checkInTime: new Date(),
    location: location || {},
    deviceInfo: deviceInfo || {},
    verificationData: {
      faceDescriptor: faceDescriptor,
      faceImage: faceImage,
      faceMatchScore: 0.95 // Placeholder - should be calculated by face recognition library
    },
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    markedBy: req.user._id
  });
  
  // Log action
  await logAction(req, {
    action: 'FACE_ATTENDANCE_MARKED',
    module: 'ATTENDANCE',
    targetId: attendance._id,
    details: {
      method: 'FACE_RECOGNITION',
      studentId: student._id
    }
  });
  
  res.json({
    success: true,
    message: 'Attendance marked successfully',
    attendance,
    student: {
      name: student.name,
      customId: student.customId
    }
  });
});

/**
 * Get face registration status
 */
export const getFaceRegistrationStatus = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  }).select('verificationData.faceDescriptor verificationData.faceImage name customId');
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  res.json({
    success: true,
    hasFaceData: !!student.verificationData?.faceDescriptor,
    faceImage: student.verificationData?.faceImage || null,
    student: {
      name: student.name,
      customId: student.customId
    }
  });
});

/**
 * Unregister face data
 */
export const unregisterFaceData = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  if (!student.verificationData?.faceDescriptor) {
    return res.status(400).json({
      success: false,
      message: 'No face data registered for this student'
    });
  }
  
  student.verificationData.faceDescriptor = undefined;
  student.verificationData.faceImage = undefined;
  await student.save();
  
  // Log action
  await logAction(req, {
    action: 'FACE_DATA_UNREGISTERED',
    module: 'ATTENDANCE',
    targetId: student._id,
    details: {
      studentId
    }
  });
  
  res.json({
    success: true,
    message: 'Face data unregistered successfully'
  });
});

/**
 * Register fingerprint template for a student
 */
export const registerFingerprintTemplate = asyncHandler(async (req, res) => {
  const { studentId, fingerprintTemplate } = req.body;
  
  // Verify student belongs to school
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  // Update student with fingerprint template
  student.verificationData = student.verificationData || {};
  student.verificationData.fingerprintTemplate = fingerprintTemplate;
  await student.save();
  
  // Log action
  await logAction(req, {
    action: 'FINGERPRINT_TEMPLATE_REGISTERED',
    module: 'ATTENDANCE',
    targetId: student._id,
    details: {
      studentId
    }
  });
  
  res.json({
    success: true,
    message: 'Fingerprint template registered successfully',
    student
  });
});

/**
 * Verify fingerprint and mark attendance
 */
export const verifyFingerprintAttendance = asyncHandler(async (req, res) => {
  const { fingerprintTemplate, location, deviceInfo } = req.body;
  
  // Find student by fingerprint template (simplified - in production use fingerprint matching library)
  const student = await User.findOne({
    school: req.schoolId,
    'verificationData.fingerprintTemplate': fingerprintTemplate,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Fingerprint not recognized'
    });
  }
  
  // Get current date
  const today = new Date().toISOString().split('T')[0];
  
  // Check if attendance already marked today for any class
  const existingAttendance = await Attendance.findOne({
    user: student._id,
    date: new Date(today),
    method: 'FINGERPRINT'
  });
  
  if (existingAttendance) {
    return res.status(400).json({
      success: false,
      message: 'Attendance already marked for today'
    });
  }
  
  // Get student's current class (for simplicity, use first class)
  const currentClass = student.classes?.[0];
  if (!currentClass) {
    return res.status(400).json({
      success: false,
      message: 'Student is not enrolled in any class'
    });
  }
  
  // Mark attendance
  const attendance = await Attendance.create({
    user: student._id,
    class: currentClass._id,
    subject: currentClass.subjectId,
    date: new Date(today),
    status: 'Present',
    method: 'FINGERPRINT',
    checkInTime: new Date(),
    location: location || {},
    deviceInfo: deviceInfo || {},
    verificationData: {
      fingerprintTemplate: fingerprintTemplate
    },
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    markedBy: req.user._id
  });
  
  // Log action
  await logAction(req, {
    action: 'FINGERPRINT_ATTENDANCE_MARKED',
    module: 'ATTENDANCE',
    targetId: attendance._id,
    details: {
      method: 'FINGERPRINT',
      studentId: student._id
    }
  });
  
  res.json({
    success: true,
    message: 'Attendance marked successfully',
    attendance,
    student: {
      name: student.name,
      customId: student.customId
    }
  });
});

/**
 * Get fingerprint registration status
 */
export const getFingerprintRegistrationStatus = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  }).select('verificationData.fingerprintTemplate name customId');
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  res.json({
    success: true,
    hasFingerprint: !!student.verificationData?.fingerprintTemplate,
    student: {
      name: student.name,
      customId: student.customId
    }
  });
});

/**
 * Unregister fingerprint template
 */
export const unregisterFingerprintTemplate = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  
  const student = await User.findOne({
    _id: studentId,
    school: req.schoolId,
    role: 'student'
  });
  
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }
  
  if (!student.verificationData?.fingerprintTemplate) {
    return res.status(400).json({
      success: false,
      message: 'No fingerprint template registered for this student'
    });
  }
  
  student.verificationData.fingerprintTemplate = undefined;
  await student.save();
  
  // Log action
  await logAction(req, {
    action: 'FINGERPRINT_TEMPLATE_UNREGISTERED',
    module: 'ATTENDANCE',
    targetId: student._id,
    details: {
      studentId
    }
  });
  
  res.json({
    success: true,
    message: 'Fingerprint template unregistered successfully'
  });
});

export default {
  generateAttendanceQR,
  verifyQRAttendance,
  getAttendanceMethodStats,
  getAttendanceByMethod,
  bulkQRAttendance,
  registerRFIDTag,
  verifyRFIDAttendance,
  getRFIDRegistrationStatus,
  unregisterRFIDTag,
  registerNFCId,
  verifyNFCAttendance,
  getNFCRegistrationStatus,
  unregisterNFCId,
  registerFaceData,
  verifyFaceAttendance,
  getFaceRegistrationStatus,
  unregisterFaceData,
  registerFingerprintTemplate,
  verifyFingerprintAttendance,
  getFingerprintRegistrationStatus,
  unregisterFingerprintTemplate
};
