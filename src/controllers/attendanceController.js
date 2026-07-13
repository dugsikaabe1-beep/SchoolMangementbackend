import asyncHandler from 'express-async-handler';
import Attendance from '../models/Attendance.js';
import QrCodeToken from '../models/QrCodeToken.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import AcademicYear from '../models/AcademicYear.js';
import { logAction } from '../utils/auditLogger.js';
import { sendNotification } from '../utils/notificationService.js';
import { getRedisClient } from '../config/redis.js';
import crypto from 'crypto';

const QR_EXPIRY_MINUTES = 5;
const QR_REDIS_PREFIX = 'qr:attendance:';

function generateQRHash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function storeQRInRedis(hash, data, ttlSeconds) {
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.setex(`${QR_REDIS_PREFIX}${hash}`, ttlSeconds, JSON.stringify(data));
      return true;
    }
  } catch (err) {
    console.warn('[QR Attendance] Redis unavailable, falling back to DB');
  }
  return false;
}

async function getQRFromRedis(hash) {
  try {
    const redis = getRedisClient();
    if (redis) {
      const data = await redis.get(`${QR_REDIS_PREFIX}${hash}`);
      return data ? JSON.parse(data) : null;
    }
  } catch (err) {
    console.warn('[QR Attendance] Redis read failed');
  }
  return null;
}

async function deleteQRFromRedis(hash) {
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.del(`${QR_REDIS_PREFIX}${hash}`);
    }
  } catch (err) {
    console.warn('[QR Attendance] Redis delete failed');
  }
}

async function markAttendanceForQR({ userId, classId, subjectId, date, method, location, deviceInfo, qrHash, schoolId, branchId, academicYearId, status }) {
  const existingAttendance = await Attendance.findOne({
    user: userId,
    class: classId,
    date: new Date(date),
    method,
    isDeleted: false
  });

  if (existingAttendance) {
    return { alreadyMarked: true, attendance: existingAttendance };
  }

  const attendanceStatus = status || 'Present';
  let checkInTime = new Date();
  let checkOutTime = undefined;

  if (method === 'QR' && attendanceStatus === 'Late') {
    checkInTime = new Date();
  }

  const attendance = await Attendance.create({
    user: userId,
    class: classId,
    subject: subjectId,
    date: new Date(date),
    status: attendanceStatus,
    method,
    checkInTime,
    checkOutTime,
    location: location || {},
    deviceInfo: deviceInfo || {},
    verificationData: { qrCode: qrHash },
    school: schoolId,
    branch: branchId,
    academicYear: academicYearId,
    markedBy: userId
  });

  return { alreadyMarked: false, attendance };
}

export const generateAttendanceQR = asyncHandler(async (req, res) => {
  const { classId, subjectId, date, durationMinutes, maxUses } = req.body;

  if (!classId || !subjectId) {
    return res.status(400).json({ success: false, message: 'Class and subject are required' });
  }

  const classDoc = await Class.findOne({ _id: classId, school: req.schoolId, isDeleted: false });
  if (!classDoc) {
    return res.status(404).json({ success: false, message: 'Class not found' });
  }

  const subjectDoc = await Subject.findOne({ _id: subjectId, school: req.schoolId, isDeleted: false });
  if (!subjectDoc) {
    return res.status(404).json({ success: false, message: 'Subject not found' });
  }

  const expiryMinutes = Math.min(Math.max(parseInt(durationMinutes) || QR_EXPIRY_MINUTES, 1), 60);
  const ttlSeconds = expiryMinutes * 60;
  const nonce = crypto.randomBytes(16).toString('hex');
  const qrDate = date || new Date().toISOString().split('T')[0];

  const qrPayload = {
    v: 1,
    s: req.schoolId.toString(),
    b: req.branchId.toString(),
    c: classId,
    sub: subjectId,
    d: qrDate,
    t: Date.now(),
    n: nonce
  };

  const qrString = JSON.stringify(qrPayload);
  const qrHash = generateQRHash(qrString);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const storedInRedis = await storeQRInRedis(qrHash, {
    hash: qrHash,
    classId,
    subjectId,
    date: qrDate,
    schoolId: req.schoolId,
    branchId: req.branchId,
    academicYearId: req.academicYearId,
    createdBy: req.user._id,
    expiresAt: expiresAt.toISOString(),
    usedBy: [],
    isRevoked: false,
    maxUses: parseInt(maxUses) || 0,
    usageCount: 0
  }, ttlSeconds);

  if (!storedInRedis) {
    await QrCodeToken.create({
      hash: qrHash,
      type: 'SESSION',
      class: classId,
      subject: subjectId,
      date: new Date(qrDate),
      expiresAt,
      school: req.schoolId,
      branch: req.branchId,
      academicYear: req.academicYearId,
      createdBy: req.user._id,
      nonce,
      maxUses: parseInt(maxUses) || 0,
      metadata: { expiryMinutes }
    });
  }

  await logAction(req, {
    action: 'QR_CODE_GENERATED',
    module: 'ATTENDANCE',
    targetId: classId,
    details: { classId, subjectId, date: qrDate, expiryMinutes, nonce }
  });

  res.json({
    success: true,
    qrCode: qrString,
    qrHash,
    expiresAt,
    expiresInMinutes: expiryMinutes,
    class: { _id: classDoc._id, name: classDoc.name },
    subject: { _id: subjectDoc._id, name: subjectDoc.name }
  });
});

export const verifyQRAttendance = asyncHandler(async (req, res) => {
  const { qrCode, location, deviceInfo } = req.body;

  if (!qrCode) {
    return res.status(400).json({ success: false, message: 'QR code is required' });
  }

  let qrPayload;
  try {
    qrPayload = JSON.parse(qrCode);
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Invalid QR code format' });
  }

  if (!qrPayload.s || !qrPayload.c || !qrPayload.sub || !qrPayload.n) {
    return res.status(400).json({ success: false, message: 'Invalid QR code data' });
  }

  if (qrPayload.s !== req.schoolId.toString()) {
    return res.status(403).json({ success: false, message: 'QR code does not belong to this school' });
  }

  const qrHash = generateQRHash(qrCode);

  let qrTokenData = await getQRFromRedis(qrHash);

  if (!qrTokenData) {
    const dbToken = await QrCodeToken.findOne({ hash: qrHash, school: req.schoolId });
    if (dbToken) {
      qrTokenData = {
        hash: dbToken.hash,
        classId: dbToken.class?.toString(),
        subjectId: dbToken.subject?.toString(),
        date: dbToken.date?.toISOString()?.split('T')?.[0],
        schoolId: dbToken.school?.toString(),
        branchId: dbToken.branch?.toString(),
        academicYearId: dbToken.academicYear?.toString(),
        createdBy: dbToken.createdBy?.toString(),
        expiresAt: dbToken.expiresAt?.toISOString(),
        usedBy: (dbToken.usedBy || []).map(u => ({ userId: u.user?.toString(), usedAt: u.usedAt })),
        isRevoked: dbToken.isRevoked,
        maxUses: dbToken.maxUses || 0,
        usageCount: dbToken.usageCount || 0
      };
    }
  }

  if (!qrTokenData) {
    return res.status(400).json({ success: false, message: 'QR code not recognized or has expired' });
  }

  if (qrTokenData.isRevoked) {
    return res.status(400).json({ success: false, message: 'QR code has been revoked' });
  }

  const now = new Date();
  const expiresAt = new Date(qrTokenData.expiresAt);
  if (now > expiresAt) {
    await deleteQRFromRedis(qrHash);
    return res.status(400).json({ success: false, message: 'QR code has expired' });
  }

  const timeSinceGeneration = (now.getTime() - qrPayload.t) / 1000 / 60;
  if (timeSinceGeneration > 60) {
    return res.status(400).json({ success: false, message: 'QR code has expired' });
  }

  if (qrTokenData.maxUses > 0 && qrTokenData.usageCount >= qrTokenData.maxUses) {
    return res.status(400).json({ success: false, message: 'QR code has reached maximum usage limit' });
  }

  const userId = req.user._id.toString();
  const alreadyUsed = (qrTokenData.usedBy || []).some(u => u.userId === userId);
  if (alreadyUsed) {
    return res.status(400).json({ success: false, message: 'You have already scanned this QR code' });
  }

  const student = await User.findOne({
    _id: req.user._id,
    school: req.schoolId,
    role: { $in: ['student', 'teacher', 'employee'] },
    isDeleted: false,
    status: 'active'
  });

  if (!student) {
    return res.status(403).json({ success: false, message: 'User not found or inactive' });
  }

  if (student.role === 'student') {
    const studentClassId = student.class?.toString();
    if (studentClassId && studentClassId !== qrPayload.c) {
      return res.status(403).json({ success: false, message: 'You are not enrolled in this class' });
    }
  }

  const classId = qrPayload.c;
  const subjectId = qrPayload.sub;
  const qrDate = qrPayload.d;

  const existingAttendance = await Attendance.findOne({
    user: req.user._id,
    class: classId,
    date: new Date(qrDate),
    method: 'QR',
    isDeleted: false
  });

  if (existingAttendance) {
    return res.status(400).json({ success: false, message: 'Attendance already marked for this session' });
  }

  const now2 = new Date();
  const classStartTime = new Date(qrDate);
  classStartTime.setHours(8, 0, 0, 0);
  const lateThreshold = new Date(qrDate);
  lateThreshold.setHours(8, 15, 0, 0);

  let attendanceStatus = 'Present';
  if (now2 > lateThreshold) {
    attendanceStatus = 'Late';
  }

  const { alreadyMarked, attendance } = await markAttendanceForQR({
    userId: req.user._id,
    classId,
    subjectId,
    date: qrDate,
    method: 'QR',
    location,
    deviceInfo,
    qrHash,
    schoolId: req.schoolId,
    branchId: req.branchId,
    academicYearId: req.academicYearId,
    status: attendanceStatus
  });

  if (alreadyMarked) {
    return res.status(400).json({ success: false, message: 'Attendance already marked for this session' });
  }

  // Notify student of successful check-in
  sendNotification({
    recipientId: req.user._id,
    schoolId: req.schoolId,
    branchId: req.branchId,
    title: 'Attendance Recorded',
    message: `Your attendance has been recorded for today. Check-in time: ${new Date().toLocaleTimeString()}`,
    type: 'attendance',
    priority: 'low',
    actionLink: '/attendance',
    metadata: { attendanceId: attendance._id, type: 'check_in', method: 'QR' },
    channels: ['in_app'],
    createdBy: req.user._id
  }).catch(() => {});

  qrTokenData.usedBy = qrTokenData.usedBy || [];
  qrTokenData.usedBy.push({ userId, usedAt: new Date().toISOString() });
  qrTokenData.usageCount = (qrTokenData.usageCount || 0) + 1;

  if (qrTokenData.schoolId) {
    await QrCodeToken.findOneAndUpdate(
      { hash: qrHash },
      {
        $push: { usedBy: { user: req.user._id, usedAt: new Date(), attendance: attendance._id } },
        $inc: { usageCount: 1 }
      }
    );
  }

  await logAction(req, {
    action: 'QR_ATTENDANCE_MARKED',
    module: 'ATTENDANCE',
    targetId: attendance._id,
    details: {
      method: 'QR',
      classId,
      subjectId,
      status: attendanceStatus,
      qrHash
    }
  });

  res.json({
    success: true,
    message: `Attendance marked successfully as ${attendanceStatus}`,
    attendance,
    status: attendanceStatus
  });
});

export const checkOutQR = asyncHandler(async (req, res) => {
  const { attendanceId } = req.params;
  const { location, deviceInfo } = req.body;

  const attendance = await Attendance.findOne({
    _id: attendanceId,
    user: req.user._id,
    school: req.schoolId,
    method: 'QR',
    isDeleted: false
  });

  if (!attendance) {
    return res.status(404).json({ success: false, message: 'Attendance record not found' });
  }

  if (attendance.checkOutTime) {
    return res.status(400).json({ success: false, message: 'Already checked out' });
  }

  attendance.checkOutTime = new Date();
  if (location) attendance.location = location;
  if (deviceInfo) attendance.deviceInfo = deviceInfo;

  const checkIn = new Date(attendance.checkInTime);
  const checkOut = new Date();
  const durationHours = (checkOut - checkIn) / (1000 * 60 * 60);
  const minSchoolHours = 4;
  if (durationHours < minSchoolHours && attendance.status !== 'Late') {
    attendance.status = 'Early_Leave';
  }

  await attendance.save();

  // Notify student of check-out
  const totalMinutes = Math.round((new Date() - new Date(attendance.checkInTime)) / 60000);
  sendNotification({
    recipientId: attendance.user,
    schoolId: req.schoolId,
    branchId: req.branchId,
    title: 'Check-Out Recorded',
    message: `Your check-out has been recorded. Total time: ${totalMinutes} minutes.`,
    type: 'attendance',
    priority: 'low',
    actionLink: '/attendance',
    metadata: { attendanceId: attendance._id, type: 'check_out', method: 'QR' },
    channels: ['in_app'],
    createdBy: req.user._id
  }).catch(() => {});

  await logAction(req, {
    action: 'QR_ATTENDANCE_CHECKOUT',
    module: 'ATTENDANCE',
    targetId: attendance._id,
    details: { attendanceId, checkOutTime: attendance.checkOutTime }
  });

  res.json({ success: true, message: 'Checked out successfully', attendance });
});

export const revokeQR = asyncHandler(async (req, res) => {
  const { qrHash } = req.body;

  if (!qrHash) {
    return res.status(400).json({ success: false, message: 'QR hash is required' });
  }

  await deleteQRFromRedis(qrHash);

  await QrCodeToken.findOneAndUpdate(
    { hash: qrHash, school: req.schoolId },
    { isRevoked: true, revokedAt: new Date(), revokedBy: req.user._id }
  );

  await logAction(req, {
    action: 'QR_CODE_REVOKED',
    module: 'ATTENDANCE',
    details: { qrHash }
  });

  res.json({ success: true, message: 'QR code revoked successfully' });
});

export const getQRAttendanceHistory = asyncHandler(async (req, res) => {
  const { classId, subjectId, startDate, endDate, studentId, status, sectionId, page = 1, limit = 50 } = req.query;

  const query = { school: req.schoolId, method: 'QR', isDeleted: false };

  if (req.branchId) query.branch = req.branchId;
  if (classId) query.class = classId;
  if (sectionId) query.section = sectionId;
  if (subjectId) query.subject = subjectId;
  if (studentId) query.user = studentId;
  if (status) query.status = status;

  if (startDate && endDate) {
    query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (startDate) {
    query.date = { $gte: new Date(startDate) };
  } else if (endDate) {
    query.date = { $lte: new Date(endDate) };
  }

  const total = await Attendance.countDocuments(query);
  const attendance = await Attendance.find(query)
    .populate('user', 'name customId role')
    .populate('class', 'name')
    .populate('subject', 'name')
    .sort({ date: -1, checkInTime: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  res.json({
    success: true,
    attendance,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

export const getQRDailyReport = asyncHandler(async (req, res) => {
  const { date, classId, subjectId } = req.query;

  const reportDate = date || new Date().toISOString().split('T')[0];
  const startOfDay = new Date(reportDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(reportDate);
  endOfDay.setHours(23, 59, 59, 999);

  const matchQuery = {
    school: req.schoolId,
    method: 'QR',
    date: { $gte: startOfDay, $lte: endOfDay },
    isDeleted: false
  };

  if (req.branchId) matchQuery.branch = req.branchId;
  if (classId) matchQuery.class = classId;
  if (subjectId) matchQuery.subject = subjectId;

  const [statusStats, methodBreakdown, lateStudents, classBreakdown] = await Promise.all([
    Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]),
    Attendance.aggregate([
      { $match: { ...matchQuery, method: 'QR' } },
      {
        $group: {
          _id: '$method',
          count: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'Late'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] } }
        }
      }
    ]),
    Attendance.find({ ...matchQuery, status: 'Late' })
      .populate('user', 'name customId')
      .populate('class', 'name')
      .sort({ checkInTime: 1 }),
    Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$class',
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'Late'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] } }
        }
      },
      { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'classInfo' } },
      { $unwind: { path: '$classInfo', preserveNullAndEmptyArrays: true } }
    ])
  ]);

  const totalPresent = statusStats.find(s => s._id === 'Present')?.count || 0;
  const totalLate = statusStats.find(s => s._id === 'Late')?.count || 0;
  const totalAbsent = statusStats.find(s => s._id === 'Absent')?.count || 0;
  const totalExcused = statusStats.find(s => s._id === 'Excused')?.count || 0;
  const totalMarked = totalPresent + totalLate + totalAbsent + totalExcused;

  res.json({
    success: true,
    report: {
      date: reportDate,
      summary: {
        totalMarked,
        present: totalPresent,
        late: totalLate,
        absent: totalAbsent,
        excused: totalExcused,
        attendanceRate: totalMarked > 0 ? ((totalPresent + totalLate) / totalMarked * 100).toFixed(1) : 0
      },
      byStatus: statusStats,
      byClass: classBreakdown,
      lateStudents: lateStudents.map(s => ({
        name: s.user?.name,
        customId: s.user?.customId,
        className: s.class?.name,
        checkInTime: s.checkInTime
      }))
    }
  });
});

export const getQRMonthlyReport = asyncHandler(async (req, res) => {
  const { month, year, classId, subjectId } = req.query;

  const targetMonth = parseInt(month) || new Date().getMonth() + 1;
  const targetYear = parseInt(year) || new Date().getFullYear();

  const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
  const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

  const matchQuery = {
    school: req.schoolId,
    method: 'QR',
    date: { $gte: startOfMonth, $lte: endOfMonth },
    isDeleted: false
  };

  if (req.branchId) matchQuery.branch = req.branchId;
  if (classId) matchQuery.class = classId;
  if (subjectId) matchQuery.subject = subjectId;

  const [dailyTrends, statusSummary, topAbsent, classComparison] = await Promise.all([
    Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'Late'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]),
    Attendance.aggregate([
      { $match: { ...matchQuery, status: 'Absent' } },
      { $group: { _id: '$user', absentDays: { $sum: 1 } } },
      { $sort: { absentDays: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } },
      { $unwind: '$userInfo' },
      { $project: { name: '$userInfo.name', customId: '$userInfo.customId', absentDays: 1 } }
    ]),
    Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { class: '$class', date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } },
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } }
        }
      },
      {
        $group: {
          _id: '$_id.class',
          totalDays: { $sum: 1 },
          avgAttendance: { $avg: { $cond: [{ $gt: ['$total', 0] }, { $divide: ['$present', '$total'] }, 0] } }
        }
      },
      { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'classInfo' } },
      { $unwind: { path: '$classInfo', preserveNullAndEmptyArrays: true } }
    ])
  ]);

  const totalPresent = statusSummary.find(s => s._id === 'Present')?.count || 0;
  const totalLate = statusSummary.find(s => s._id === 'Late')?.count || 0;
  const totalAbsent = statusSummary.find(s => s._id === 'Absent')?.count || 0;
  const totalExcused = statusSummary.find(s => s._id === 'Excused')?.count || 0;
  const totalRecords = totalPresent + totalLate + totalAbsent + totalExcused;

  res.json({
    success: true,
    report: {
      month: targetMonth,
      year: targetYear,
      summary: {
        totalRecords,
        present: totalPresent,
        late: totalLate,
        absent: totalAbsent,
        excused: totalExcused,
        attendanceRate: totalRecords > 0 ? ((totalPresent + totalLate) / totalRecords * 100).toFixed(1) : 0
      },
      dailyTrends,
      topAbsentStudents: topAbsent,
      classComparison: classComparison.map(c => ({
        className: c.classInfo?.name,
        totalDays: c.totalDays,
        avgAttendance: (c.avgAttendance * 100).toFixed(1)
      }))
    }
  });
});

export const generatePersonalQR = asyncHandler(async (req, res) => {
  const { userId, validityDays } = req.body;

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  }).select('name customId role class school branch');

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const days = Math.min(Math.max(parseInt(validityDays) || 30, 1), 365);
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const qrPayload = {
    v: 1,
    type: 'PERSONAL',
    uid: targetUser._id.toString(),
    s: req.schoolId.toString(),
    b: (targetUser.branch || req.branchId).toString(),
    n: nonce,
    exp: expiresAt.toISOString()
  };

  const qrString = JSON.stringify(qrPayload);
  const qrHash = generateQRHash(qrString);

  await QrCodeToken.create({
    hash: qrHash,
    type: 'PERSONAL',
    personalUser: targetUser._id,
    date: new Date(),
    expiresAt,
    school: req.schoolId,
    branch: targetUser.branch || req.branchId,
    academicYear: req.academicYearId,
    createdBy: req.user._id,
    nonce
  });

  await logAction(req, {
    action: 'PERSONAL_QR_GENERATED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId, validityDays: days, expiresAt }
  });

  res.json({
    success: true,
    qrCode: qrString,
    qrHash,
    expiresAt,
    validityDays: days,
    user: {
      _id: targetUser._id,
      name: targetUser.name,
      customId: targetUser.customId,
      role: targetUser.role
    }
  });
});

export const verifyPersonalQR = asyncHandler(async (req, res) => {
  const { qrCode, location, deviceInfo } = req.body;

  if (!qrCode) {
    return res.status(400).json({ success: false, message: 'QR code is required' });
  }

  let qrPayload;
  try {
    qrPayload = JSON.parse(qrCode);
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Invalid QR code format' });
  }

  if (qrPayload.type !== 'PERSONAL') {
    return res.status(400).json({ success: false, message: 'Not a personal QR code' });
  }

  if (qrPayload.s !== req.schoolId.toString()) {
    return res.status(403).json({ success: false, message: 'QR code does not belong to this school' });
  }

  if (qrPayload.exp && new Date(qrPayload.exp) < new Date()) {
    return res.status(400).json({ success: false, message: 'Personal QR code has expired' });
  }

  const qrHash = generateQRHash(qrCode);
  const dbToken = await QrCodeToken.findOne({ hash: qrHash, type: 'PERSONAL', school: req.schoolId });

  if (!dbToken) {
    return res.status(400).json({ success: false, message: 'QR code not recognized' });
  }

  if (dbToken.isRevoked) {
    return res.status(400).json({ success: false, message: 'QR code has been revoked' });
  }

  const targetUser = await User.findOne({
    _id: qrPayload.uid,
    school: req.schoolId,
    isDeleted: false,
    status: 'active'
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const today = new Date().toISOString().split('T')[0];
  const existingAttendance = await Attendance.findOne({
    user: targetUser._id,
    date: new Date(today),
    isDeleted: false
  });

  if (existingAttendance) {
    return res.status(400).json({ success: false, message: 'Attendance already marked for today' });
  }

  const classId = targetUser.class;
  if (!classId) {
    return res.status(400).json({ success: false, message: 'User has no class assigned' });
  }

  const attendance = await Attendance.create({
    user: targetUser._id,
    class: classId,
    subject: null,
    date: new Date(today),
    status: 'Present',
    method: 'QR',
    checkInTime: new Date(),
    location: location || {},
    deviceInfo: deviceInfo || {},
    verificationData: { qrCode: qrHash },
    school: req.schoolId,
    branch: targetUser.branch || req.branchId,
    academicYear: req.academicYearId,
    markedBy: req.user._id
  });

  await logAction(req, {
    action: 'PERSONAL_QR_ATTENDANCE_MARKED',
    module: 'ATTENDANCE',
    targetId: attendance._id,
    details: { targetUserId: targetUser._id, qrHash }
  });

  res.json({
    success: true,
    message: 'Attendance marked successfully',
    attendance,
    student: { name: targetUser.name, customId: targetUser.customId }
  });
});

export const bulkQRAttendance = asyncHandler(async (req, res) => {
  const { qrCodes } = req.body;

  if (!Array.isArray(qrCodes) || qrCodes.length === 0) {
    return res.status(400).json({ success: false, message: 'qrCodes array is required' });
  }

  if (qrCodes.length > 100) {
    return res.status(400).json({ success: false, message: 'Maximum 100 QR codes per batch' });
  }

  const results = [];

  for (const item of qrCodes) {
    try {
      const qrPayload = JSON.parse(item.code);
      const qrHash = generateQRHash(item.code);

      const qrTokenData = await getQRFromRedis(qrHash) || (() => {
        const dbToken = QrCodeToken.findOne({ hash: qrHash, school: req.schoolId });
        return dbToken;
      })();

      if (!qrTokenData) {
        results.push({ success: false, code: item.code, error: 'QR not recognized' });
        continue;
      }

      if (qrTokenData.isRevoked) {
        results.push({ success: false, code: item.code, error: 'QR revoked' });
        continue;
      }

      const alreadyUsed = (qrTokenData.usedBy || []).some(u => u.userId === item.studentId);
      if (alreadyUsed) {
        results.push({ success: false, code: item.code, error: 'Already scanned' });
        continue;
      }

      const { alreadyMarked, attendance } = await markAttendanceForQR({
        userId: item.studentId,
        classId: qrPayload.c || qrTokenData.classId,
        subjectId: qrPayload.sub || qrTokenData.subjectId,
        date: qrPayload.d || qrTokenData.date,
        method: 'QR',
        location: item.location,
        deviceInfo: item.deviceInfo,
        qrHash,
        schoolId: req.schoolId,
        branchId: req.branchId,
        academicYearId: req.academicYearId
      });

      if (alreadyMarked) {
        results.push({ success: false, code: item.code, error: 'Already marked' });
        continue;
      }

      if (qrTokenData.schoolId) {
        await QrCodeToken.findOneAndUpdate(
          { hash: qrHash },
          { $push: { usedBy: { user: item.studentId, usedAt: new Date(), attendance: attendance._id } }, $inc: { usageCount: 1 } }
        );
      }

      results.push({ success: true, studentId: item.studentId, attendanceId: attendance._id });
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  await logAction(req, {
    action: 'QR_BULK_ATTENDANCE',
    module: 'ATTENDANCE',
    details: { total: qrCodes.length, success: successCount, failed: failCount }
  });

  res.json({
    success: true,
    summary: { total: qrCodes.length, success: successCount, failed: failCount },
    results
  });
});

export const getAttendanceMethodStats = asyncHandler(async (req, res) => {
  const { startDate, endDate, classId, academicYearId } = req.query;

  const matchQuery = {
    school: req.schoolId,
    isDeleted: false
  };

  if (req.branchId) matchQuery.branch = req.branchId;
  if (classId) matchQuery.class = classId;
  if (academicYearId) matchQuery.academicYear = academicYearId;

  if (startDate && endDate) {
    matchQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (startDate) {
    matchQuery.date = { $gte: new Date(startDate) };
  }

  const stats = await Attendance.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$method',
        count: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'Late'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$status', 'Excused'] }, 1, 0] } }
      }
    },
    { $sort: { count: -1 } }
  ]);

  res.json({ success: true, stats });
});

export const getAttendanceByMethod = asyncHandler(async (req, res) => {
  const { method, classId, studentId, startDate, endDate, page = 1, limit = 50 } = req.query;

  const query = {
    school: req.schoolId,
    isDeleted: false
  };

  if (req.branchId) query.branch = req.branchId;
  if (method) query.method = method;
  if (classId) query.class = classId;
  if (studentId) query.user = studentId;

  if (startDate && endDate) {
    query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (startDate) {
    query.date = { $gte: new Date(startDate) };
  }

  const total = await Attendance.countDocuments(query);
  const attendance = await Attendance.find(query)
    .populate('user', 'name customId role')
    .populate('class', 'name')
    .populate('subject', 'name')
    .sort({ date: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  res.json({
    success: true,
    attendance,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

export const exportAttendance = asyncHandler(async (req, res) => {
  const { method, classId, subjectId, startDate, endDate, format = 'json' } = req.query;

  const query = { school: req.schoolId, isDeleted: false };

  if (req.branchId) query.branch = req.branchId;
  if (method) query.method = method;
  if (classId) query.class = classId;
  if (subjectId) query.subject = subjectId;

  if (startDate && endDate) {
    query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  const attendance = await Attendance.find(query)
    .populate('user', 'name customId role')
    .populate('class', 'name')
    .populate('subject', 'name')
    .sort({ date: -1 })
    .limit(5000);

  if (format === 'csv') {
    const headers = ['Student Name', 'Student ID', 'Class', 'Subject', 'Date', 'Status', 'Method', 'Check In', 'Check Out'];
    const rows = attendance.map(a => [
      a.user?.name,
      a.user?.customId,
      a.class?.name,
      a.subject?.name,
      a.date?.toISOString()?.split('T')?.[0],
      a.status,
      a.method,
      a.checkInTime?.toISOString(),
      a.checkOutTime?.toISOString() || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell || ''}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance-export.csv');
    return res.send(csv);
  }

  res.json({ success: true, attendance, total: attendance.length });
});

export const registerRFIDTag = asyncHandler(async (req, res) => {
  const { userId, rfidTag, role = 'student' } = req.body;

  if (!userId || !rfidTag) {
    return res.status(400).json({ success: false, message: 'userId and rfidTag are required' });
  }

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    role: { $in: Array.isArray(role) ? role : [role] },
    isDeleted: false
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const existingUser = await User.findOne({
    school: req.schoolId,
    'verificationData.rfidTag': rfidTag,
    _id: { $ne: userId }
  });

  if (existingUser) {
    return res.status(400).json({ success: false, message: 'RFID tag is already registered to another user' });
  }

  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.rfidTag = rfidTag;
  targetUser.verificationData.rfidRegisteredAt = new Date();
  targetUser.verificationData.rfidStatus = 'active';
  await targetUser.save();

  await logAction(req, {
    action: 'RFID_TAG_REGISTERED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId, rfidTag, role: targetUser.role }
  });

  res.json({
    success: true,
    message: 'RFID tag registered successfully',
    user: { _id: targetUser._id, name: targetUser.name, customId: targetUser.customId, role: targetUser.role }
  });
});

export const verifyRFIDAttendance = asyncHandler(async (req, res) => {
  const { rfidTag, location, deviceInfo, classId, subjectId } = req.body;

  if (!rfidTag) {
    return res.status(400).json({ success: false, message: 'RFID tag is required' });
  }

  const targetUser = await User.findOne({
    school: req.schoolId,
    'verificationData.rfidTag': rfidTag,
    'verificationData.rfidStatus': 'active',
    role: { $in: ['student', 'teacher', 'employee'] },
    isDeleted: false,
    status: 'active'
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'RFID tag not registered or inactive' });
  }

  const today = new Date().toISOString().split('T')[0];

  const existingAttendance = await Attendance.findOne({
    user: targetUser._id,
    date: new Date(today),
    method: 'RFID',
    isDeleted: false
  });

  if (existingAttendance) {
    if (!existingAttendance.checkOutTime) {
      existingAttendance.checkOutTime = new Date();
      if (location) existingAttendance.location = location;
      await existingAttendance.save();

      await logAction(req, {
        action: 'RFID_ATTENDANCE_CHECKOUT',
        module: 'ATTENDANCE',
        targetId: existingAttendance._id,
        details: { userId: targetUser._id, rfidTag }
      });

      return res.json({
        success: true,
        message: 'Check-out recorded',
        attendance: existingAttendance,
        type: 'CHECK_OUT',
        student: { name: targetUser.name, customId: targetUser.customId }
      });
    }

    return res.status(400).json({ success: false, message: 'Attendance already marked for today' });
  }

  const resolvedClassId = classId || targetUser.class;
  if (!resolvedClassId) {
    return res.status(400).json({ success: false, message: 'No class specified' });
  }

  const attendance = await Attendance.create({
    user: targetUser._id,
    class: resolvedClassId,
    subject: subjectId || null,
    date: new Date(today),
    status: 'Present',
    method: 'RFID',
    checkInTime: new Date(),
    location: location || {},
    deviceInfo: deviceInfo || {},
    verificationData: { rfidTag },
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    markedBy: req.user._id
  });

  await logAction(req, {
    action: 'RFID_ATTENDANCE_MARKED',
    module: 'ATTENDANCE',
    targetId: attendance._id,
    details: { method: 'RFID', userId: targetUser._id, rfidTag }
  });

  res.json({
    success: true,
    message: 'Attendance marked successfully',
    attendance,
    type: 'CHECK_IN',
    student: { name: targetUser.name, customId: targetUser.customId }
  });
});

export const getRFIDRegistrationStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  }).select('verificationData.rfidTag verificationData.rfidStatus verificationData.rfidRegisteredAt name customId role');

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  res.json({
    success: true,
    hasRFID: !!targetUser.verificationData?.rfidTag,
    rfidTag: targetUser.verificationData?.rfidTag || null,
    rfidStatus: targetUser.verificationData?.rfidStatus || 'none',
    registeredAt: targetUser.verificationData?.rfidRegisteredAt || null,
    user: { name: targetUser.name, customId: targetUser.customId, role: targetUser.role }
  });
});

export const unregisterRFIDTag = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (!targetUser.verificationData?.rfidTag) {
    return res.status(400).json({ success: false, message: 'No RFID tag registered' });
  }

  const oldTag = targetUser.verificationData.rfidTag;
  targetUser.verificationData.rfidTag = undefined;
  targetUser.verificationData.rfidStatus = undefined;
  targetUser.verificationData.rfidRegisteredAt = undefined;
  await targetUser.save();

  await logAction(req, {
    action: 'RFID_TAG_UNREGISTERED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId, oldTag }
  });

  res.json({ success: true, message: 'RFID tag unregistered successfully' });
});

export const replaceRFIDCard = asyncHandler(async (req, res) => {
  const { userId, newRfidTag, reason } = req.body;

  if (!userId || !newRfidTag) {
    return res.status(400).json({ success: false, message: 'userId and newRfidTag are required' });
  }

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const existingUser = await User.findOne({
    school: req.schoolId,
    'verificationData.rfidTag': newRfidTag,
    _id: { $ne: userId }
  });

  if (existingUser) {
    return res.status(400).json({ success: false, message: 'New RFID tag is already registered' });
  }

  const oldTag = targetUser.verificationData?.rfidTag;
  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.rfidTag = newRfidTag;
  targetUser.verificationData.rfidStatus = 'active';
  targetUser.verificationData.rfidRegisteredAt = new Date();
  targetUser.verificationData.rfidPreviousTag = oldTag;
  await targetUser.save();

  await logAction(req, {
    action: 'RFID_CARD_REPLACED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId, oldTag, newTag: newRfidTag, reason }
  });

  res.json({ success: true, message: 'RFID card replaced successfully' });
});

export const deactivateRFIDCard = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.rfidStatus = 'inactive';
  await targetUser.save();

  await logAction(req, {
    action: 'RFID_CARD_DEACTIVATED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId }
  });

  res.json({ success: true, message: 'RFID card deactivated' });
});

export const activateRFIDCard = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (!targetUser.verificationData?.rfidTag) {
    return res.status(400).json({ success: false, message: 'No RFID tag to activate' });
  }

  targetUser.verificationData.rfidStatus = 'active';
  await targetUser.save();

  await logAction(req, {
    action: 'RFID_CARD_ACTIVATED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId }
  });

  res.json({ success: true, message: 'RFID card activated' });
});

export const registerNFCId = asyncHandler(async (req, res) => {
  const { userId, nfcId, role = 'student' } = req.body;

  if (!userId || !nfcId) {
    return res.status(400).json({ success: false, message: 'userId and nfcId are required' });
  }

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    role: { $in: Array.isArray(role) ? role : [role] },
    isDeleted: false
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const existingUser = await User.findOne({
    school: req.schoolId,
    'verificationData.nfcId': nfcId,
    _id: { $ne: userId }
  });

  if (existingUser) {
    return res.status(400).json({ success: false, message: 'NFC ID already registered to another user' });
  }

  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.nfcId = nfcId;
  targetUser.verificationData.nfcRegisteredAt = new Date();
  targetUser.verificationData.nfcStatus = 'active';
  await targetUser.save();

  await logAction(req, {
    action: 'NFC_ID_REGISTERED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId, nfcId, role: targetUser.role }
  });

  res.json({
    success: true,
    message: 'NFC ID registered successfully',
    user: { _id: targetUser._id, name: targetUser.name, customId: targetUser.customId, role: targetUser.role }
  });
});

export const verifyNFCAttendance = asyncHandler(async (req, res) => {
  const { nfcId, location, deviceInfo, classId, subjectId } = req.body;

  if (!nfcId) {
    return res.status(400).json({ success: false, message: 'NFC ID is required' });
  }

  const targetUser = await User.findOne({
    school: req.schoolId,
    'verificationData.nfcId': nfcId,
    'verificationData.nfcStatus': 'active',
    role: { $in: ['student', 'teacher', 'employee'] },
    isDeleted: false,
    status: 'active'
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'NFC tag not registered or inactive' });
  }

  const today = new Date().toISOString().split('T')[0];

  const existingAttendance = await Attendance.findOne({
    user: targetUser._id,
    date: new Date(today),
    method: 'NFC',
    isDeleted: false
  });

  if (existingAttendance) {
    if (!existingAttendance.checkOutTime) {
      existingAttendance.checkOutTime = new Date();
      if (location) existingAttendance.location = location;
      await existingAttendance.save();

      return res.json({
        success: true,
        message: 'Check-out recorded',
        attendance: existingAttendance,
        type: 'CHECK_OUT',
        student: { name: targetUser.name, customId: targetUser.customId }
      });
    }

    return res.status(400).json({ success: false, message: 'Attendance already marked for today' });
  }

  const resolvedClassId = classId || targetUser.class;
  if (!resolvedClassId) {
    return res.status(400).json({ success: false, message: 'No class specified' });
  }

  const attendance = await Attendance.create({
    user: targetUser._id,
    class: resolvedClassId,
    subject: subjectId || null,
    date: new Date(today),
    status: 'Present',
    method: 'NFC',
    checkInTime: new Date(),
    location: location || {},
    deviceInfo: deviceInfo || {},
    verificationData: { nfcId },
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    markedBy: req.user._id
  });

  await logAction(req, {
    action: 'NFC_ATTENDANCE_MARKED',
    module: 'ATTENDANCE',
    targetId: attendance._id,
    details: { method: 'NFC', userId: targetUser._id, nfcId }
  });

  res.json({
    success: true,
    message: 'Attendance marked successfully',
    attendance,
    type: 'CHECK_IN',
    student: { name: targetUser.name, customId: targetUser.customId }
  });
});

export const getNFCRegistrationStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  }).select('verificationData.nfcId verificationData.nfcStatus verificationData.nfcRegisteredAt name customId role');

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  res.json({
    success: true,
    hasNFC: !!targetUser.verificationData?.nfcId,
    nfcId: targetUser.verificationData?.nfcId || null,
    nfcStatus: targetUser.verificationData?.nfcStatus || 'none',
    registeredAt: targetUser.verificationData?.nfcRegisteredAt || null,
    user: { name: targetUser.name, customId: targetUser.customId, role: targetUser.role }
  });
});

export const unregisterNFCId = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (!targetUser.verificationData?.nfcId) {
    return res.status(400).json({ success: false, message: 'No NFC ID registered' });
  }

  const oldId = targetUser.verificationData.nfcId;
  targetUser.verificationData.nfcId = undefined;
  targetUser.verificationData.nfcStatus = undefined;
  targetUser.verificationData.nfcRegisteredAt = undefined;
  await targetUser.save();

  await logAction(req, {
    action: 'NFC_ID_UNREGISTERED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId, oldId }
  });

  res.json({ success: true, message: 'NFC ID unregistered successfully' });
});

export const registerFaceData = asyncHandler(async (req, res) => {
  const { userId, faceEmbeddings, role = 'student' } = req.body;

  if (!userId || !faceEmbeddings || !Array.isArray(faceEmbeddings) || faceEmbeddings.length === 0) {
    return res.status(400).json({ success: false, message: 'userId and faceEmbeddings array are required' });
  }

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    role: { $in: Array.isArray(role) ? role : [role] },
    isDeleted: false
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.faceEmbeddings = faceEmbeddings;
  targetUser.verificationData.faceRegisteredAt = new Date();
  targetUser.verificationData.faceStatus = 'active';
  targetUser.verificationData.faceEnrollmentCount = faceEmbeddings.length;
  await targetUser.save();

  await logAction(req, {
    action: 'FACE_DATA_REGISTERED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId, enrollmentCount: faceEmbeddings.length, role: targetUser.role }
  });

  res.json({
    success: true,
    message: 'Face data registered successfully',
    user: { _id: targetUser._id, name: targetUser.name, customId: targetUser.customId, role: targetUser.role }
  });
});

export const verifyFaceAttendance = asyncHandler(async (req, res) => {
  // Accept both array form (faceEmbeddings) and single-vector form (faceDescriptor)
  const rawEmbeddings = req.body.faceEmbeddings || (req.body.faceDescriptor ? [req.body.faceDescriptor] : null);
  const { location, deviceInfo, classId, subjectId, userId: hintUserId } = req.body;

  if (!rawEmbeddings || !Array.isArray(rawEmbeddings) || rawEmbeddings.length === 0) {
    return res.status(400).json({ success: false, message: 'faceEmbeddings (or faceDescriptor) array is required' });
  }

  const faceEmbeddings = rawEmbeddings;

  const allUsers = await User.find({
    school: req.schoolId,
    'verificationData.faceStatus': 'active',
    'verificationData.faceEmbeddings': { $exists: true, $ne: [] },
    role: { $in: ['student', 'teacher', 'employee'] },
    isDeleted: false,
    status: 'active'
  }).select('name customId role class branch verificationData.faceEmbeddings');

  if (allUsers.length === 0) {
    return res.status(404).json({ success: false, message: 'No enrolled faces found' });
  }

  let bestMatch = null;
  let bestScore = Infinity;
  const THRESHOLD = 0.6;

  for (const user of allUsers) {
    const storedEmbeddings = user.verificationData?.faceEmbeddings || [];
    for (const storedEmb of storedEmbeddings) {
      for (const inputEmb of faceEmbeddings) {
        if (storedEmb.length !== inputEmb.length) continue;
        let distance = 0;
        for (let i = 0; i < storedEmb.length; i++) {
          distance += (storedEmb[i] - inputEmb[i]) ** 2;
        }
        distance = Math.sqrt(distance);
        if (distance < bestScore) {
          bestScore = distance;
          bestMatch = user;
        }
      }
    }
  }

  if (!bestMatch || bestScore > THRESHOLD) {
    await logAction(req, {
      action: 'FACE_RECOGNITION_FAILED',
      module: 'ATTENDANCE',
      details: { bestScore, threshold: THRESHOLD }
    });

    return res.status(404).json({ success: false, message: 'Face not recognized', confidence: bestScore ? (1 - bestScore).toFixed(4) : 0 });
  }

  const confidence = 1 - bestScore;
  const today = new Date().toISOString().split('T')[0];

  const existingAttendance = await Attendance.findOne({
    user: bestMatch._id,
    date: new Date(today),
    method: 'FACE_RECOGNITION',
    isDeleted: false
  });

  if (existingAttendance) {
    return res.status(400).json({ success: false, message: 'Attendance already marked for today' });
  }

  const resolvedClassId = classId || bestMatch.class;
  if (!resolvedClassId) {
    return res.status(400).json({ success: false, message: 'No class specified' });
  }

  const attendance = await Attendance.create({
    user: bestMatch._id,
    class: resolvedClassId,
    subject: subjectId || null,
    date: new Date(today),
    status: 'Present',
    method: 'FACE_RECOGNITION',
    checkInTime: new Date(),
    location: location || {},
    deviceInfo: deviceInfo || {},
    verificationData: { faceMatchScore: confidence },
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    markedBy: req.user._id
  });

  await logAction(req, {
    action: 'FACE_ATTENDANCE_MARKED',
    module: 'ATTENDANCE',
    targetId: attendance._id,
    details: { method: 'FACE_RECOGNITION', userId: bestMatch._id, confidence }
  });

  res.json({
    success: true,
    message: 'Attendance marked successfully',
    attendance,
    confidence,
    student: { name: bestMatch.name, customId: bestMatch.customId, role: bestMatch.role }
  });
});

export const getFaceRegistrationStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  }).select('verificationData.faceStatus verificationData.faceRegisteredAt verificationData.faceEnrollmentCount name customId role');

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  res.json({
    success: true,
    hasFaceData: !!targetUser.verificationData?.faceStatus,
    faceStatus: targetUser.verificationData?.faceStatus || 'none',
    registeredAt: targetUser.verificationData?.faceRegisteredAt || null,
    enrollmentCount: targetUser.verificationData?.faceEnrollmentCount || 0,
    user: { name: targetUser.name, customId: targetUser.customId, role: targetUser.role }
  });
});

export const unregisterFaceData = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.faceEmbeddings = [];
  targetUser.verificationData.faceStatus = 'inactive';
  await targetUser.save();

  await logAction(req, {
    action: 'FACE_DATA_UNREGISTERED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId }
  });

  res.json({ success: true, message: 'Face data unregistered successfully' });
});

export const registerFingerprintTemplate = asyncHandler(async (req, res) => {
  const { userId, fingerprintTemplate, fingerIndex = 0, role = 'student' } = req.body;

  if (!userId || !fingerprintTemplate) {
    return res.status(400).json({ success: false, message: 'userId and fingerprintTemplate are required' });
  }

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    role: { $in: Array.isArray(role) ? role : [role] },
    isDeleted: false
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  targetUser.verificationData = targetUser.verificationData || {};
  if (!targetUser.verificationData.fingerprints) {
    targetUser.verificationData.fingerprints = [];
  }

  const existingFinger = targetUser.verificationData.fingerprints.find(f => f.fingerIndex === fingerIndex);
  if (existingFinger) {
    existingFinger.template = fingerprintTemplate;
    existingFinger.enrolledAt = new Date();
    existingFinger.status = 'active';
  } else {
    targetUser.verificationData.fingerprints.push({
      fingerIndex,
      template: fingerprintTemplate,
      enrolledAt: new Date(),
      status: 'active'
    });
  }

  targetUser.verificationData.fingerprintStatus = 'active';
  targetUser.verificationData.fingerprintRegisteredAt = new Date();
  await targetUser.save();

  await logAction(req, {
    action: 'FINGERPRINT_REGISTERED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId, fingerIndex, role: targetUser.role }
  });

  res.json({
    success: true,
    message: 'Fingerprint registered successfully',
    user: { _id: targetUser._id, name: targetUser.name, customId: targetUser.customId, role: targetUser.role }
  });
});

export const verifyFingerprintAttendance = asyncHandler(async (req, res) => {
  const { fingerprintTemplate, location, deviceInfo, classId, subjectId } = req.body;

  if (!fingerprintTemplate) {
    return res.status(400).json({ success: false, message: 'fingerprintTemplate is required' });
  }

  const targetUser = await User.findOne({
    school: req.schoolId,
    'verificationData.fingerprints': {
      $elemMatch: { template: fingerprintTemplate, status: 'active' }
    },
    'verificationData.fingerprintStatus': 'active',
    role: { $in: ['student', 'teacher', 'employee'] },
    isDeleted: false,
    status: 'active'
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'Fingerprint not recognized' });
  }

  const today = new Date().toISOString().split('T')[0];

  const existingAttendance = await Attendance.findOne({
    user: targetUser._id,
    date: new Date(today),
    method: 'FINGERPRINT',
    isDeleted: false
  });

  if (existingAttendance) {
    if (!existingAttendance.checkOutTime) {
      existingAttendance.checkOutTime = new Date();
      if (location) existingAttendance.location = location;
      await existingAttendance.save();

      return res.json({
        success: true,
        message: 'Check-out recorded',
        attendance: existingAttendance,
        type: 'CHECK_OUT',
        student: { name: targetUser.name, customId: targetUser.customId }
      });
    }

    return res.status(400).json({ success: false, message: 'Attendance already marked for today' });
  }

  const resolvedClassId = classId || targetUser.class;
  if (!resolvedClassId) {
    return res.status(400).json({ success: false, message: 'No class specified' });
  }

  const attendance = await Attendance.create({
    user: targetUser._id,
    class: resolvedClassId,
    subject: subjectId || null,
    date: new Date(today),
    status: 'Present',
    method: 'FINGERPRINT',
    checkInTime: new Date(),
    location: location || {},
    deviceInfo: deviceInfo || {},
    verificationData: { fingerprintVerified: true },
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    markedBy: req.user._id
  });

  await logAction(req, {
    action: 'FINGERPRINT_ATTENDANCE_MARKED',
    module: 'ATTENDANCE',
    targetId: attendance._id,
    details: { method: 'FINGERPRINT', userId: targetUser._id }
  });

  res.json({
    success: true,
    message: 'Attendance marked successfully',
    attendance,
    type: 'CHECK_IN',
    student: { name: targetUser.name, customId: targetUser.customId }
  });
});

export const getFingerprintRegistrationStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  }).select('verificationData.fingerprints verificationData.fingerprintStatus verificationData.fingerprintRegisteredAt name customId role');

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const fingerprints = (targetUser.verificationData?.fingerprints || []).map(f => ({
    fingerIndex: f.fingerIndex,
    status: f.status,
    enrolledAt: f.enrolledAt
  }));

  res.json({
    success: true,
    hasFingerprint: fingerprints.length > 0,
    fingerprintStatus: targetUser.verificationData?.fingerprintStatus || 'none',
    registeredAt: targetUser.verificationData?.fingerprintRegisteredAt || null,
    enrolledFingers: fingerprints,
    totalEnrolled: fingerprints.length,
    user: { name: targetUser.name, customId: targetUser.customId, role: targetUser.role }
  });
});

export const unregisterFingerprintTemplate = asyncHandler(async (req, res) => {
  const { userId, fingerIndex } = req.params;

  const targetUser = await User.findOne({
    _id: userId,
    school: req.schoolId,
    isDeleted: false
  });

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (fingerIndex !== undefined) {
    const fingerprints = targetUser.verificationData?.fingerprints || [];
    const idx = fingerprints.findIndex(f => f.fingerIndex === parseInt(fingerIndex));
    if (idx === -1) {
      return res.status(400).json({ success: false, message: 'Finger not found' });
    }
    fingerprints.splice(idx, 1);
    targetUser.verificationData.fingerprints = fingerprints;

    if (fingerprints.length === 0) {
      targetUser.verificationData.fingerprintStatus = 'inactive';
    }
  } else {
    targetUser.verificationData = targetUser.verificationData || {};
    targetUser.verificationData.fingerprints = [];
    targetUser.verificationData.fingerprintStatus = 'inactive';
  }

  await targetUser.save();

  await logAction(req, {
    action: 'FINGERPRINT_UNREGISTERED',
    module: 'ATTENDANCE',
    targetId: targetUser._id,
    details: { userId, fingerIndex: fingerIndex || 'all' }
  });

  res.json({ success: true, message: 'Fingerprint unregistered successfully' });
});

export const replaceNFCCard = asyncHandler(async (req, res) => {
  const { userId, newNfcId, reason } = req.body;

  if (!userId || !newNfcId) {
    return res.status(400).json({ success: false, message: 'userId and newNfcId are required' });
  }

  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  const existingUser = await User.findOne({
    school: req.schoolId, 'verificationData.nfcId': newNfcId, _id: { $ne: userId }
  });
  if (existingUser) return res.status(400).json({ success: false, message: 'New NFC ID is already registered' });

  const oldId = targetUser.verificationData?.nfcId;
  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.nfcId = newNfcId;
  targetUser.verificationData.nfcStatus = 'active';
  targetUser.verificationData.nfcRegisteredAt = new Date();
  targetUser.verificationData.nfcPreviousId = oldId;
  await targetUser.save();

  await logAction(req, {
    action: 'NFC_CARD_REPLACED', module: 'ATTENDANCE', targetId: targetUser._id,
    details: { userId, oldId, newId: newNfcId, reason }
  });

  res.json({ success: true, message: 'NFC card replaced successfully' });
});

export const deactivateNFCCard = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.nfcStatus = 'inactive';
  await targetUser.save();

  await logAction(req, {
    action: 'NFC_CARD_DEACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId }
  });

  res.json({ success: true, message: 'NFC card deactivated' });
});

export const activateNFCCard = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  if (!targetUser.verificationData?.nfcId) {
    return res.status(400).json({ success: false, message: 'No NFC ID to activate' });
  }

  targetUser.verificationData.nfcStatus = 'active';
  await targetUser.save();

  await logAction(req, {
    action: 'NFC_CARD_ACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId }
  });

  res.json({ success: true, message: 'NFC card activated' });
});

export const replaceFaceData = asyncHandler(async (req, res) => {
  const { userId, faceDescriptor, reason } = req.body;

  if (!userId || !faceDescriptor) {
    return res.status(400).json({ success: false, message: 'userId and faceDescriptor are required' });
  }

  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.faceEmbeddings = [faceDescriptor];
  targetUser.verificationData.faceStatus = 'active';
  targetUser.verificationData.faceRegisteredAt = new Date();
  await targetUser.save();

  await logAction(req, {
    action: 'FACE_DATA_REPLACED', module: 'ATTENDANCE', targetId: targetUser._id,
    details: { userId, reason }
  });

  res.json({ success: true, message: 'Face data replaced successfully' });
});

export const deactivateFaceData = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.faceStatus = 'inactive';
  await targetUser.save();

  await logAction(req, {
    action: 'FACE_DATA_DEACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId }
  });

  res.json({ success: true, message: 'Face data deactivated' });
});

export const activateFaceData = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  if (!targetUser.verificationData?.faceEmbeddings?.length) {
    return res.status(400).json({ success: false, message: 'No face data to activate' });
  }

  targetUser.verificationData.faceStatus = 'active';
  await targetUser.save();

  await logAction(req, {
    action: 'FACE_DATA_ACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId }
  });

  res.json({ success: true, message: 'Face data activated' });
});

export const replaceFingerprint = asyncHandler(async (req, res) => {
  const { userId, fingerprintTemplate, reason } = req.body;

  if (!userId || !fingerprintTemplate) {
    return res.status(400).json({ success: false, message: 'userId and fingerprintTemplate are required' });
  }

  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.fingerprints = [{ fingerIndex: 0, template: fingerprintTemplate, enrolledAt: new Date() }];
  targetUser.verificationData.fingerprintStatus = 'active';
  targetUser.verificationData.fingerprintRegisteredAt = new Date();
  await targetUser.save();

  await logAction(req, {
    action: 'FINGERPRINT_REPLACED', module: 'ATTENDANCE', targetId: targetUser._id,
    details: { userId, reason }
  });

  res.json({ success: true, message: 'Fingerprint replaced successfully' });
});

export const deactivateFingerprint = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.fingerprintStatus = 'inactive';
  await targetUser.save();

  await logAction(req, {
    action: 'FINGERPRINT_DEACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId }
  });

  res.json({ success: true, message: 'Fingerprint deactivated' });
});

export const activateFingerprint = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  if (!targetUser.verificationData?.fingerprints?.length) {
    return res.status(400).json({ success: false, message: 'No fingerprint data to activate' });
  }

  targetUser.verificationData.fingerprintStatus = 'active';
  await targetUser.save();

  await logAction(req, {
    action: 'FINGERPRINT_ACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId }
  });

  res.json({ success: true, message: 'Fingerprint activated' });
});

export const getModuleAttendanceReport = asyncHandler(async (req, res) => {
  const { method, classId, startDate, endDate, sectionId } = req.query;
  if (!method) return res.status(400).json({ success: false, message: 'method query param is required (NFC, FINGERPRINT, FACE_RECOGNITION)' });

  const query = { school: req.schoolId, method, isDeleted: false };
  if (req.branchId) query.branch = req.branchId;
  if (classId) query.class = classId;
  if (sectionId) query.section = sectionId;
  if (startDate && endDate) query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };

  const [statusStats, dailyTrends, classBreakdown, topStudents] = await Promise.all([
    Attendance.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    Attendance.aggregate([
      { $match: query },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } }, late: { $sum: { $cond: [{ $eq: ['$status', 'Late'] }, 1, 0] } } } },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]),
    Attendance.aggregate([
      { $match: query },
      { $group: { _id: '$class', total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } } } },
      { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'classInfo' } },
      { $unwind: { path: '$classInfo', preserveNullAndEmptyArrays: true } },
      { $project: { name: '$classInfo.name', total: 1, present: 1 } }
    ]),
    Attendance.aggregate([
      { $match: { ...query, status: { $in: ['Present', 'Late'] } } },
      { $group: { _id: '$user', count: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } },
      { $unwind: '$userInfo' },
      { $project: { name: '$userInfo.name', customId: '$userInfo.customId', count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ])
  ]);

  const totalRecords = await Attendance.countDocuments(query);
  const uniqueUsers = await Attendance.distinct('user', query);

  res.json({
    success: true,
    report: {
      method,
      totalRecords,
      uniqueUsers: uniqueUsers.length,
      statusBreakdown: statusStats.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {}),
      dailyTrends,
      classBreakdown,
      topStudents,
      dateRange: { startDate: startDate || 'all', endDate: endDate || 'all' }
    }
  });
});

export const validateGeofence = asyncHandler(async (req, res) => {
  const { latitude, longitude, schoolLat, schoolLng, radiusMeters = 500 } = req.body;
  if (!latitude || !longitude || !schoolLat || !schoolLng) {
    return res.status(400).json({ success: false, message: 'latitude, longitude, schoolLat, schoolLng are required' });
  }
  const R = 6371000;
  const dLat = (schoolLat - latitude) * Math.PI / 180;
  const dLon = (schoolLng - longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(latitude * Math.PI / 180) * Math.cos(schoolLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const withinGeofence = distance <= radiusMeters;

  res.json({ success: true, withinGeofence, distance: Math.round(distance), radiusMeters });
});

export default {
  generateAttendanceQR,
  verifyQRAttendance,
  checkOutQR,
  revokeQR,
  getQRAttendanceHistory,
  getQRDailyReport,
  getQRMonthlyReport,
  generatePersonalQR,
  verifyPersonalQR,
  bulkQRAttendance,
  getAttendanceMethodStats,
  getAttendanceByMethod,
  exportAttendance,
  getModuleAttendanceReport,
  validateGeofence,
  registerRFIDTag,
  verifyRFIDAttendance,
  getRFIDRegistrationStatus,
  unregisterRFIDTag,
  replaceRFIDCard,
  deactivateRFIDCard,
  activateRFIDCard,
  registerNFCId,
  verifyNFCAttendance,
  getNFCRegistrationStatus,
  unregisterNFCId,
  replaceNFCCard,
  deactivateNFCCard,
  activateNFCCard,
  registerFaceData,
  verifyFaceAttendance,
  getFaceRegistrationStatus,
  unregisterFaceData,
  replaceFaceData,
  deactivateFaceData,
  activateFaceData,
  registerFingerprintTemplate,
  verifyFingerprintAttendance,
  getFingerprintRegistrationStatus,
  unregisterFingerprintTemplate,
  replaceFingerprint,
  deactivateFingerprint,
  activateFingerprint
};

// ── Face: replace / deactivate / activate ────────────────────────────────────
export const replaceFaceData = asyncHandler(async (req, res) => {
  const { userId, faceEmbeddings } = req.body;
  if (!userId || !faceEmbeddings || !Array.isArray(faceEmbeddings) || faceEmbeddings.length === 0) {
    return res.status(400).json({ success: false, message: 'userId and faceEmbeddings array are required' });
  }
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.faceEmbeddings = faceEmbeddings;
  targetUser.verificationData.faceRegisteredAt = new Date();
  targetUser.verificationData.faceStatus = 'active';
  targetUser.verificationData.faceEnrollmentCount = faceEmbeddings.length;
  await targetUser.save();

  await logAction(req, { action: 'FACE_DATA_REPLACED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId } });
  res.json({ success: true, message: 'Face data replaced successfully' });
});

export const deactivateFaceData = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });
  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.faceStatus = 'inactive';
  await targetUser.save();
  await logAction(req, { action: 'FACE_DATA_DEACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId } });
  res.json({ success: true, message: 'Face data deactivated' });
});

export const activateFaceData = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });
  if (!targetUser.verificationData?.faceEmbeddings?.length) {
    return res.status(400).json({ success: false, message: 'No face data to activate' });
  }
  targetUser.verificationData.faceStatus = 'active';
  await targetUser.save();
  await logAction(req, { action: 'FACE_DATA_ACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId } });
  res.json({ success: true, message: 'Face data activated' });
});

// ── Fingerprint: replace / deactivate / activate ──────────────────────────────
export const replaceFingerprint = asyncHandler(async (req, res) => {
  const { userId, fingerprintTemplate, fingerIndex = 0 } = req.body;
  if (!userId || !fingerprintTemplate) {
    return res.status(400).json({ success: false, message: 'userId and fingerprintTemplate are required' });
  }
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  targetUser.verificationData = targetUser.verificationData || {};
  const fingerprints = targetUser.verificationData.fingerprints || [];
  const idx = fingerprints.findIndex(f => f.fingerIndex === fingerIndex);
  if (idx >= 0) {
    fingerprints[idx].template = fingerprintTemplate;
    fingerprints[idx].enrolledAt = new Date();
    fingerprints[idx].status = 'active';
  } else {
    fingerprints.push({ fingerIndex, template: fingerprintTemplate, enrolledAt: new Date(), status: 'active' });
  }
  targetUser.verificationData.fingerprints = fingerprints;
  targetUser.verificationData.fingerprintStatus = 'active';
  await targetUser.save();

  await logAction(req, { action: 'FINGERPRINT_REPLACED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId, fingerIndex } });
  res.json({ success: true, message: 'Fingerprint replaced successfully' });
});

export const deactivateFingerprint = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });
  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.fingerprintStatus = 'inactive';
  await targetUser.save();
  await logAction(req, { action: 'FINGERPRINT_DEACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId } });
  res.json({ success: true, message: 'Fingerprint deactivated' });
});

export const activateFingerprint = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });
  if (!targetUser.verificationData?.fingerprints?.length) {
    return res.status(400).json({ success: false, message: 'No fingerprint data to activate' });
  }
  targetUser.verificationData.fingerprintStatus = 'active';
  await targetUser.save();
  await logAction(req, { action: 'FINGERPRINT_ACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId } });
  res.json({ success: true, message: 'Fingerprint activated' });
});

// ── Module attendance report ───────────────────────────────────────────────────
export const getModuleAttendanceReport = asyncHandler(async (req, res) => {
  const { module: mod, classId, startDate, endDate } = req.query;
  const query = { school: req.schoolId, isDeleted: false };
  if (req.branchId) query.branch = req.branchId;
  if (classId) query.class = classId;
  if (mod) query.method = mod.toUpperCase();
  if (startDate && endDate) {
    query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }
  const stats = await Attendance.aggregate([
    { $match: query },
    { $group: {
      _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, status: '$status' },
      count: { $sum: 1 }
    }},
    { $sort: { '_id.date': 1 } }
  ]);
  res.json({ success: true, data: stats });
});

// ── Geofence validation ────────────────────────────────────────────────────────
export const validateGeofence = asyncHandler(async (req, res) => {
  const { latitude, longitude, schoolId } = req.body;
  if (!latitude || !longitude) {
    return res.status(400).json({ success: false, message: 'latitude and longitude are required' });
  }
  // Default school radius: 500 metres. In a real deployment, store school coordinates in School model.
  const school = await (await import('../models/School.js')).default.findById(req.schoolId).select('address location');
  if (!school?.location?.coordinates) {
    // No geofence configured — allow all
    return res.json({ success: true, isInsideGeofence: true, message: 'Geofence not configured, access granted' });
  }
  const [sLng, sLat] = school.location.coordinates;
  const R = 6371000; // metres
  const dLat = ((latitude - sLat) * Math.PI) / 180;
  const dLon = ((longitude - sLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((sLat * Math.PI) / 180) * Math.cos((latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const radius = school.geofenceRadius || 500;
  const isInside = distance <= radius;
  res.json({ success: true, isInsideGeofence: isInside, distance: Math.round(distance), allowedRadius: radius });
});

// ── NFC deactivate / activate ─────────────────────────────────────────────────
export const deactivateNFCCard = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });
  targetUser.verificationData = targetUser.verificationData || {};
  targetUser.verificationData.nfcStatus = 'inactive';
  await targetUser.save();
  await logAction(req, { action: 'NFC_CARD_DEACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId } });
  res.json({ success: true, message: 'NFC card deactivated' });
});

export const activateNFCCard = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const targetUser = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: false });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });
  if (!targetUser.verificationData?.nfcId) {
    return res.status(400).json({ success: false, message: 'No NFC ID to activate' });
  }
  targetUser.verificationData.nfcStatus = 'active';
  await targetUser.save();
  await logAction(req, { action: 'NFC_CARD_ACTIVATED', module: 'ATTENDANCE', targetId: targetUser._id, details: { userId } });
  res.json({ success: true, message: 'NFC card activated' });
});
