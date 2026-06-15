import crypto from 'crypto';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Mark from '../models/Mark.js';
import Attendance from '../models/Attendance.js';
import MonthlyPayment from '../models/MonthlyPayment.js';
import Payment from '../models/Payment.js';
import ConsentRequest from '../models/ConsentRequest.js';
import ScheduledReport from '../models/ScheduledReport.js';
import ApiActivityLog from '../models/ApiActivityLog.js';
import DataArchive from '../models/DataArchive.js';
import Document from '../models/Document.js';
import School from '../models/School.js';
import { tenantFilter } from '../utils/tenantQuery.js';
import { logAction } from '../utils/auditLogger.js';
import { enqueueJob, getQueueStatus } from '../services/jobQueue.js';

const ok = (res, data = {}) => res.json({ success: true, ...data });
const active = { isDeleted: { $ne: true } };
const gradeFromScore = (score) => score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
const gpaFromScore = (score) => score >= 90 ? 4 : score >= 80 ? 3 : score >= 70 ? 2 : score >= 60 ? 1 : 0;
const totalMark = (m) => Number(m.total || m.marks || ((m.monthly1 || 0) + (m.midterm || 0) + (m.monthly2 || 0) + (m.final || 0)));

async function scopedStudent(req, studentId) {
  return User.findOne({ ...tenantFilter(req, active), _id: studentId, role: 'student' }).populate('class', 'name section');
}

function asRows(items, columns) {
  return items.map((item) => Object.fromEntries(columns.map((col) => [col.header, col.value(item)])));
}

async function streamWorkbook(res, sheetName, filename, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  const headers = Object.keys(rows[0] || { Status: 'No records' });
  sheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(16, header.length + 4) }));
  if (rows.length) rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

export const getEnterpriseOverview = asyncHandler(async (req, res) => {
  const [students, teachers, classes, consents, schedules, apiErrors] = await Promise.all([
    User.countDocuments({ ...tenantFilter(req, active), role: 'student' }),
    User.countDocuments({ ...tenantFilter(req, active), role: 'teacher' }),
    Class.countDocuments({ ...tenantFilter(req, active) }),
    ConsentRequest.countDocuments({ ...tenantFilter(req, active), status: 'pending' }),
    ScheduledReport.countDocuments({ ...tenantFilter(req, active), isActive: true }),
    ApiActivityLog.countDocuments({ ...tenantFilter(req), statusCode: { $gte: 400 }, requestTime: { $gte: new Date(Date.now() - 86400000) } }),
  ]);
  ok(res, { data: { students, teachers, classes, pendingConsents: consents, activeScheduledReports: schedules, apiErrors24h: apiErrors, queue: getQueueStatus() } });
});

export const getTranscript = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { type = 'student', academicYear } = req.query;
  const student = await scopedStudent(req, studentId);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const markQuery = { ...tenantFilter(req), student: studentId, deletedAt: { $exists: false } };
  if (academicYear) markQuery.academicYear = academicYear;
  const marks = await Mark.find(markQuery).populate('subject', 'name code').populate('exam', 'name term').sort({ academicYear: 1 });
  const subjects = marks.map((mark) => {
    const score = totalMark(mark);
    return {
      subject: mark.subject?.name || 'Subject',
      code: mark.subject?.code || '',
      score,
      grade: gradeFromScore(score),
      gpa: gpaFromScore(score),
      academicYear: mark.academicYear,
      term: mark.exam?.term || mark.exam?.name || 'Term',
    };
  });
  const averageScore = subjects.length ? subjects.reduce((sum, row) => sum + row.score, 0) / subjects.length : 0;
  const gpa = subjects.length ? subjects.reduce((sum, row) => sum + row.gpa, 0) / subjects.length : 0;
  const verificationNumber = crypto.createHash('sha1').update(`${student._id}-${type}-${academicYear || 'all'}`).digest('hex').slice(0, 12).toUpperCase();
  ok(res, {
    data: {
      type,
      student,
      academicYear: academicYear || 'All',
      averageScore: Number(averageScore.toFixed(2)),
      gpa: Number(gpa.toFixed(2)),
      subjects,
      verificationNumber,
      qrVerification: `/verify/transcript/${verificationNumber}`,
    },
  });
});

export const exportTranscript = asyncHandler(async (req, res) => {
  const fakeRes = { json: (payload) => payload };
  const payload = await new Promise((resolve, reject) => {
    getTranscript(req, { json: resolve, status: () => ({ json: resolve }) }).catch(reject);
  });
  const transcript = payload.data;
  const rows = transcript.subjects.map((row) => ({
    Student: transcript.student.name,
    'Academic Year': row.academicYear,
    Subject: row.subject,
    Score: row.score,
    Grade: row.grade,
    GPA: row.gpa,
    Verification: transcript.verificationNumber,
  }));
  await streamWorkbook(res, 'Transcript', `transcript-${transcript.student.customId || transcript.student._id}.xlsx`, rows);
});

export const exportTranscriptPdf = asyncHandler(async (req, res) => {
  const payload = await new Promise((resolve, reject) => {
    getTranscript(req, { json: resolve, status: () => ({ json: resolve }) }).catch(reject);
  });
  const transcript = payload.data;
  const doc = new PDFDocument({ margin: 48 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="transcript-${transcript.student.customId || transcript.student._id}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text('Academic Transcript', { align: 'center' });
  doc.moveDown();
  doc.fontSize(11).text(`Student: ${transcript.student.name}`);
  doc.text(`Student ID: ${transcript.student.customId || '-'}`);
  doc.text(`Academic Year: ${transcript.academicYear}`);
  doc.text(`Average Score: ${transcript.averageScore}`);
  doc.text(`GPA: ${transcript.gpa}`);
  doc.text(`Verification Number: ${transcript.verificationNumber}`);
  doc.text(`QR Verification: ${transcript.qrVerification}`);
  doc.moveDown();

  doc.fontSize(12).text('Subjects', { underline: true });
  doc.moveDown(0.5);
  transcript.subjects.forEach((row) => {
    doc.fontSize(10).text(`${row.subject} | Score: ${row.score} | Grade: ${row.grade} | GPA: ${row.gpa} | Year: ${row.academicYear}`);
  });

  doc.end();
});

export const getStudentLifecycle = asyncHandler(async (req, res) => {
  const student = await scopedStudent(req, req.params.studentId);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
  const [attendanceCount, marksCount, payments] = await Promise.all([
    Attendance.countDocuments({ ...tenantFilter(req), user: student._id, deletedAt: { $exists: false } }),
    Mark.countDocuments({ ...tenantFilter(req), student: student._id, deletedAt: { $exists: false } }),
    MonthlyPayment.find({ ...tenantFilter(req), student: student._id, isDeleted: { $ne: true } }).sort({ year: 1, createdAt: 1 }).limit(12),
  ]);
  const timeline = [
    { stage: 'Admission', date: student.admissionDate || student.createdAt, status: 'completed', detail: 'Student admitted' },
    { stage: 'Enrollment', date: student.createdAt, status: student.class ? 'completed' : 'pending', detail: student.class ? `Enrolled in ${student.class.name || ''}` : 'Class pending' },
    { stage: 'Attendance', date: new Date(), status: attendanceCount ? 'active' : 'pending', detail: `${attendanceCount} attendance records` },
    { stage: 'Exams', date: new Date(), status: marksCount ? 'active' : 'pending', detail: `${marksCount} grade records` },
    { stage: 'Fees', date: payments[0]?.createdAt || new Date(), status: payments.some((p) => p.status === 'UNPAID') ? 'attention' : 'clear', detail: `${payments.length} fee records reviewed` },
    { stage: 'Promotion', date: student.updatedAt, status: student.status === 'graduated' ? 'completed' : 'active', detail: student.status },
    { stage: 'Graduation', date: student.updatedAt, status: student.status === 'graduated' ? 'completed' : 'pending', detail: student.status === 'graduated' ? 'Graduated' : 'Not graduated' },
    { stage: 'Alumni', date: student.updatedAt, status: student.status === 'graduated' ? 'active' : 'pending', detail: student.status === 'graduated' ? 'Alumni record active' : 'Future stage' },
  ];
  ok(res, { data: { student, timeline } });
});

export const getTeacherPerformance = asyncHandler(async (req, res) => {
  const teachers = await User.find({ ...tenantFilter(req, active), role: 'teacher' }).select('name customId subjects');
  const data = await Promise.all(teachers.map(async (teacher) => {
    const [attendanceTotal, attendancePresent, submittedMarks, classMarks] = await Promise.all([
      Attendance.countDocuments({ ...tenantFilter(req), markedBy: teacher._id, deletedAt: { $exists: false } }),
      Attendance.countDocuments({ ...tenantFilter(req), markedBy: teacher._id, status: 'Present', deletedAt: { $exists: false } }),
      Mark.countDocuments({ ...tenantFilter(req), gradedBy: teacher._id, deletedAt: { $exists: false } }),
      Mark.find({ ...tenantFilter(req), gradedBy: teacher._id, deletedAt: { $exists: false } }).select('total marks monthly1 midterm monthly2 final'),
    ]);
    const scores = classMarks.map(totalMark);
    const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return {
      teacher,
      attendanceRate: attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 100) : 0,
      examSubmissionRate: submittedMarks ? 100 : 0,
      gradeSubmissionRate: submittedMarks,
      studentPerformance: Number(average.toFixed(2)),
      classPerformance: Number(average.toFixed(2)),
    };
  }));
  ok(res, { data });
});

export const getStudentRisk = asyncHandler(async (req, res) => {
  const students = await User.find({ ...tenantFilter(req, active), role: 'student' }).populate('class', 'name section');
  const rows = await Promise.all(students.map(async (student) => {
    const [attendanceTotal, attendancePresent, marks, unpaid] = await Promise.all([
      Attendance.countDocuments({ ...tenantFilter(req), user: student._id, deletedAt: { $exists: false } }),
      Attendance.countDocuments({ ...tenantFilter(req), user: student._id, status: 'Present', deletedAt: { $exists: false } }),
      Mark.find({ ...tenantFilter(req), student: student._id, deletedAt: { $exists: false } }).select('total marks monthly1 midterm monthly2 final'),
      MonthlyPayment.countDocuments({ ...tenantFilter(req), student: student._id, status: 'UNPAID', isDeleted: { $ne: true } }),
    ]);
    const attendanceRate = attendanceTotal ? (attendancePresent / attendanceTotal) * 100 : 100;
    const average = marks.length ? marks.map(totalMark).reduce((a, b) => a + b, 0) / marks.length : 100;
    const reasons = [];
    if (attendanceRate < 75) reasons.push('Low attendance');
    if (average < 60) reasons.push('Poor academic performance');
    if (unpaid > 0) reasons.push('Fee defaulter');
    const score = (attendanceRate < 75 ? 2 : 0) + (average < 60 ? 2 : 0) + (unpaid > 0 ? 1 : 0);
    return {
      student,
      atRisk: reasons.length > 0,
      riskLevel: score >= 4 ? 'High' : score >= 2 ? 'Medium' : reasons.length ? 'Low' : 'Clear',
      reason: reasons.join(', ') || 'No active risk detected',
      recommendedAction: reasons.length ? 'Schedule parent follow-up and review support plan' : 'Continue routine monitoring',
      attendanceRate: Number(attendanceRate.toFixed(1)),
      averageScore: Number(average.toFixed(1)),
      unpaidMonths: unpaid,
    };
  }));
  ok(res, { data: rows.filter((row) => row.atRisk || req.query.includeClear === 'true') });
});

export const listConsents = asyncHandler(async (req, res) => {
  const records = await ConsentRequest.find({ ...tenantFilter(req, active) }).populate('student', 'name customId').populate('parent', 'name phone email').sort({ createdAt: -1 });
  ok(res, { data: records });
});

export const createConsent = asyncHandler(async (req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  const record = await ConsentRequest.create({
    ...req.body,
    school: req.schoolId,
    branch: req.branchId || req.body.branch,
    mobileApprovalToken: token,
    createdBy: req.user._id,
  });
  await enqueueJob('notification.consent_request', { consentId: record._id, token });
  logAction(req, { action: 'CREATE_CONSENT_REQUEST', module: 'CONSENT', targetId: record._id, details: { title: record.title } });
  ok(res, { data: record });
});

export const updateConsent = asyncHandler(async (req, res) => {
  const record = await ConsentRequest.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { ...req.body, updatedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Consent request not found' });
  logAction(req, { action: 'UPDATE_CONSENT_REQUEST', module: 'CONSENT', targetId: record._id });
  ok(res, { data: record });
});

export const deleteConsent = asyncHandler(async (req, res) => {
  const record = await ConsentRequest.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Consent request not found' });
  logAction(req, { action: 'DELETE_CONSENT_REQUEST', module: 'CONSENT', targetId: record._id });
  ok(res, { message: 'Consent request archived', data: record });
});

export const respondConsent = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { status, responseNote } = req.body;
  if (!['approved', 'declined'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid consent response' });
  const record = await ConsentRequest.findOne({ mobileApprovalToken: token, isDeleted: { $ne: true } });
  if (!record) return res.status(404).json({ success: false, message: 'Consent request not found' });
  record.status = status;
  record.responseNote = responseNote;
  record[status === 'approved' ? 'approvedAt' : 'declinedAt'] = new Date();
  await record.save();
  ok(res, { data: record });
});

export const listScheduledReports = asyncHandler(async (req, res) => {
  const records = await ScheduledReport.find({ ...tenantFilter(req, active) }).sort({ createdAt: -1 });
  ok(res, { data: records });
});

export const createScheduledReport = asyncHandler(async (req, res) => {
  const record = await ScheduledReport.create({ ...req.body, school: req.schoolId, branch: req.branchId || req.body.branch, createdBy: req.user._id });
  await enqueueJob('report.schedule_created', { scheduledReportId: record._id });
  logAction(req, { action: 'CREATE_SCHEDULED_REPORT', module: 'REPORTS', targetId: record._id });
  ok(res, { data: record });
});

export const updateScheduledReport = asyncHandler(async (req, res) => {
  const record = await ScheduledReport.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { ...req.body, updatedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Scheduled report not found' });
  logAction(req, { action: 'UPDATE_SCHEDULED_REPORT', module: 'REPORTS', targetId: record._id });
  ok(res, { data: record });
});

export const deleteScheduledReport = asyncHandler(async (req, res) => {
  const record = await ScheduledReport.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Scheduled report not found' });
  logAction(req, { action: 'DELETE_SCHEDULED_REPORT', module: 'REPORTS', targetId: record._id });
  ok(res, { message: 'Scheduled report archived', data: record });
});

export const getStorageUsage = asyncHandler(async (req, res) => {
  const [school, documents] = await Promise.all([
    School.findById(req.schoolId).select('planLimits limits subscription'),
    Document.find({ ...tenantFilter(req, active) }).select('title type file createdAt'),
  ]);
  const usedBytes = documents.reduce((sum, doc) => sum + Number(doc.file?.bytes || 0), 0);
  const limitMb = school?.planLimits?.storage || school?.limits?.storage || 1024;
  const categories = documents.reduce((acc, doc) => {
    const key = doc.type || 'Other';
    acc[key] = (acc[key] || 0) + Number(doc.file?.bytes || 0);
    return acc;
  }, {});
  ok(res, { data: { usedBytes, usedMb: Number((usedBytes / 1048576).toFixed(2)), limitMb, remainingMb: Number((limitMb - usedBytes / 1048576).toFixed(2)), categories, files: documents } });
});

export const getApiActivity = asyncHandler(async (req, res) => {
  const logs = await ApiActivityLog.find({ ...tenantFilter(req) }).populate('user', 'name email role').sort({ requestTime: -1 }).limit(Number(req.query.limit || 100));
  ok(res, { data: logs });
});

export const getFeeForecast = asyncHandler(async (req, res) => {
  const payments = await MonthlyPayment.find({ ...tenantFilter(req), isDeleted: { $ne: true } }).sort({ year: 1, createdAt: 1 });
  const expectedRevenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const outstandingRevenue = payments.filter((p) => p.status === 'UNPAID').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const collectedRevenue = expectedRevenue - outstandingRevenue;
  const monthly = {};
  payments.forEach((p) => {
    const key = p.monthLabel || `${p.month} ${p.year}`;
    monthly[key] ||= { expected: 0, collected: 0, outstanding: 0 };
    monthly[key].expected += Number(p.amount || 0);
    if (p.status === 'PAID') monthly[key].collected += Number(p.amount || 0);
    else monthly[key].outstanding += Number(p.amount || 0);
  });
  ok(res, { data: { expectedRevenue, collectedRevenue, outstandingRevenue, futureCollections: outstandingRevenue, collectionTrends: Object.entries(monthly).map(([month, values]) => ({ month, ...values })) } });
});

export const getSmartDefaulters = asyncHandler(async (req, res) => {
  const unpaid = await MonthlyPayment.find({ ...tenantFilter(req), status: 'UNPAID', isDeleted: { $ne: true } }).populate('student', 'name customId parentPhone class').sort({ year: 1, createdAt: 1 });
  const now = Date.now();
  const data = unpaid.map((payment) => {
    const ageDays = Math.max(0, Math.floor((now - new Date(payment.createdAt).getTime()) / 86400000));
    const bucket = ageDays >= 90 ? '90 Day Overdue' : ageDays >= 60 ? '60 Day Overdue' : ageDays >= 30 ? '30 Day Overdue' : 'Current';
    return { payment, student: payment.student, ageDays, bucket, alert: ageDays >= 30 };
  });
  ok(res, { data });
});

export const listArchives = asyncHandler(async (req, res) => {
  const records = await DataArchive.find({ ...tenantFilter(req), isDeleted: { $ne: true } }).sort({ archivedAt: -1 });
  ok(res, { data: records });
});

export const createArchive = asyncHandler(async (req, res) => {
  const { archiveType, academicYear, title } = req.body;
  const base = { ...tenantFilter(req), ...(academicYear ? { academicYear } : {}) };
  const recordCount = archiveType === 'students'
    ? await User.countDocuments({ ...base, role: 'student', isDeleted: { $ne: true } })
    : archiveType === 'attendance'
      ? await Attendance.countDocuments({ ...base, deletedAt: { $exists: false } })
      : archiveType === 'exams'
        ? await Mark.countDocuments({ ...base, deletedAt: { $exists: false } })
        : 0;
  const archive = await DataArchive.create({ school: req.schoolId, branch: req.branchId, archiveType, academicYear, title: title || `${archiveType} archive`, criteria: req.body.criteria || {}, recordCount, createdBy: req.user._id });
  logAction(req, { action: 'CREATE_ARCHIVE', module: 'ARCHIVE', targetId: archive._id, details: { archiveType, recordCount } });
  ok(res, { data: archive });
});

export const restoreArchive = asyncHandler(async (req, res) => {
  const archive = await DataArchive.findOneAndUpdate({ ...tenantFilter(req), _id: req.params.id, status: 'archived' }, { status: 'restored', restoredAt: new Date(), restoredBy: req.user._id }, { new: true });
  if (!archive) return res.status(404).json({ success: false, message: 'Archive not found' });
  logAction(req, { action: 'RESTORE_ARCHIVE', module: 'ARCHIVE', targetId: archive._id });
  ok(res, { data: archive });
});

export const exportEnterpriseReport = asyncHandler(async (req, res) => {
  const { type } = req.params;
  if (type === 'risk') {
    const payload = await new Promise((resolve, reject) => getStudentRisk(req, { json: resolve }).catch(reject));
    const rows = asRows(payload.data, [
      { header: 'Student', value: (r) => r.student.name },
      { header: 'Risk Level', value: (r) => r.riskLevel },
      { header: 'Reason', value: (r) => r.reason },
      { header: 'Recommended Action', value: (r) => r.recommendedAction },
    ]);
    return streamWorkbook(res, 'Risk Report', 'student-risk-report.xlsx', rows);
  }
  if (type === 'defaulters') {
    const payload = await new Promise((resolve, reject) => getSmartDefaulters(req, { json: resolve }).catch(reject));
    const rows = asRows(payload.data, [
      { header: 'Student', value: (r) => r.student?.name || '' },
      { header: 'Bucket', value: (r) => r.bucket },
      { header: 'Days Overdue', value: (r) => r.ageDays },
      { header: 'Amount', value: (r) => r.payment.amount },
    ]);
    return streamWorkbook(res, 'Defaulters', 'smart-defaulters.xlsx', rows);
  }
  return res.status(400).json({ success: false, message: 'Unsupported report export type' });
});
