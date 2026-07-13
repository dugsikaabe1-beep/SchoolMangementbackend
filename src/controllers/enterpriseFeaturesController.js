import asyncHandler from 'express-async-handler';
import { tenantFilter } from '../utils/tenantQuery.js';
import { logAction } from '../utils/auditLogger.js';
import Discipline from '../models/Discipline.js';
import HealthRecord from '../models/HealthRecord.js';
import Portfolio from '../models/Portfolio.js';
import Alumni from '../models/Alumni.js';
import Visitor from '../models/Visitor.js';
import Procurement from '../models/Procurement.js';
import EnterpriseFinance from '../models/EnterpriseFinance.js';
import RevenueForecast from '../models/RevenueForecast.js';
import Payroll from '../models/Payroll.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Payment from '../models/Payment.js';
import MonthlyPayment from '../models/MonthlyPayment.js';
import Mark from '../models/Mark.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';

const ok = (res, data = {}) => res.json({ success: true, ...data });
const active = { isDeleted: { $ne: true } };

// ============ Discipline Management
export const getDisciplines = asyncHandler(async (req, res) => {
  const records = await Discipline.find({ ...tenantFilter(req, active) })
    .populate('student', 'name customId')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  ok(res, { data: records });
});

export const createDiscipline = asyncHandler(async (req, res) => {
  const record = await Discipline.create({
    ...req.body,
    school: req.schoolId,
    branch: req.branchId || req.body.branch,
    createdBy: req.user._id
  });
  logAction(req, { action: 'CREATE_DISCIPLINE', module: 'DISCIPLINE', targetId: record._id });
  ok(res, { data: record });
});

export const updateDiscipline = asyncHandler(async (req, res) => {
  const record = await Discipline.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { ...req.body, updatedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Discipline record not found' });
  logAction(req, { action: 'UPDATE_DISCIPLINE', module: 'DISCIPLINE', targetId: record._id });
  ok(res, { data: record });
});

export const deleteDiscipline = asyncHandler(async (req, res) => {
  const record = await Discipline.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Discipline record not found' });
  logAction(req, { action: 'DELETE_DISCIPLINE', module: 'DISCIPLINE', targetId: record._id });
  ok(res, { message: 'Discipline record archived', data: record });
});

// ============ Health Records Management
export const getHealthRecords = asyncHandler(async (req, res) => {
  const records = await HealthRecord.find({ ...tenantFilter(req, active) })
    .populate('student', 'name customId')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  ok(res, { data: records });
});

export const createHealthRecord = asyncHandler(async (req, res) => {
  const record = await HealthRecord.create({
    ...req.body,
    school: req.schoolId,
    branch: req.branchId || req.body.branch,
    createdBy: req.user._id
  });
  logAction(req, { action: 'CREATE_HEALTH_RECORD', module: 'HEALTH', targetId: record._id });
  ok(res, { data: record });
});

export const updateHealthRecord = asyncHandler(async (req, res) => {
  const record = await HealthRecord.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { ...req.body, updatedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Health record not found' });
  logAction(req, { action: 'UPDATE_HEALTH_RECORD', module: 'HEALTH', targetId: record._id });
  ok(res, { data: record });
});

export const deleteHealthRecord = asyncHandler(async (req, res) => {
  const record = await HealthRecord.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Health record not found' });
  logAction(req, { action: 'DELETE_HEALTH_RECORD', module: 'HEALTH', targetId: record._id });
  ok(res, { message: 'Health record archived', data: record });
});

// ============ Portfolio Management
export const getPortfolios = asyncHandler(async (req, res) => {
  const records = await Portfolio.find({ ...tenantFilter(req, active) })
    .populate('student', 'name customId')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  ok(res, { data: records });
});

export const createPortfolio = asyncHandler(async (req, res) => {
  const record = await Portfolio.create({
    ...req.body,
    school: req.schoolId,
    branch: req.branchId || req.body.branch,
    createdBy: req.user._id
  });
  logAction(req, { action: 'CREATE_PORTFOLIO', module: 'PORTFOLIO', targetId: record._id });
  ok(res, { data: record });
});

export const updatePortfolio = asyncHandler(async (req, res) => {
  const record = await Portfolio.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { ...req.body, updatedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Portfolio not found' });
  logAction(req, { action: 'UPDATE_PORTFOLIO', module: 'PORTFOLIO', targetId: record._id });
  ok(res, { data: record });
});

export const deletePortfolio = asyncHandler(async (req, res) => {
  const record = await Portfolio.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Portfolio not found' });
  logAction(req, { action: 'DELETE_PORTFOLIO', module: 'PORTFOLIO', targetId: record._id });
  ok(res, { message: 'Portfolio archived', data: record });
});

// ============ Alumni Management
export const getAlumni = asyncHandler(async (req, res) => {
  const records = await Alumni.find({ ...tenantFilter(req, active) })
    .populate('originalStudent', 'name customId')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  ok(res, { data: records });
});

export const createAlumni = asyncHandler(async (req, res) => {
  const record = await Alumni.create({
    ...req.body,
    school: req.schoolId,
    branch: req.branchId || req.body.branch,
    createdBy: req.user._id
  });
  logAction(req, { action: 'CREATE_ALUMNI', module: 'ALUMNI', targetId: record._id });
  ok(res, { data: record });
});

export const updateAlumni = asyncHandler(async (req, res) => {
  const record = await Alumni.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { ...req.body, updatedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Alumni record not found' });
  logAction(req, { action: 'UPDATE_ALUMNI', module: 'ALUMNI', targetId: record._id });
  ok(res, { data: record });
});

export const deleteAlumni = asyncHandler(async (req, res) => {
  const record = await Alumni.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Alumni record not found' });
  logAction(req, { action: 'DELETE_ALUMNI', module: 'ALUMNI', targetId: record._id });
  ok(res, { message: 'Alumni record archived', data: record });
});

// ============ Visitor Management
export const getVisitors = asyncHandler(async (req, res) => {
  const records = await Visitor.find({ ...tenantFilter(req, active) })
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  ok(res, { data: records });
});

export const createVisitor = asyncHandler(async (req, res) => {
  const record = await Visitor.create({
    ...req.body,
    school: req.schoolId,
    branch: req.branchId || req.body.branch,
    createdBy: req.user._id
  });
  logAction(req, { action: 'CREATE_VISITOR', module: 'VISITOR', targetId: record._id });
  ok(res, { data: record });
});

export const updateVisitor = asyncHandler(async (req, res) => {
  const record = await Visitor.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { ...req.body, updatedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Visitor record not found' });
  logAction(req, { action: 'UPDATE_VISITOR', module: 'VISITOR', targetId: record._id });
  ok(res, { data: record });
});

export const deleteVisitor = asyncHandler(async (req, res) => {
  const record = await Visitor.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Visitor record not found' });
  logAction(req, { action: 'DELETE_VISITOR', module: 'VISITOR', targetId: record._id });
  ok(res, { message: 'Visitor record archived', data: record });
});

// ============ Procurement Management
export const getProcurements = asyncHandler(async (req, res) => {
  const records = await Procurement.find({ ...tenantFilter(req, active) })
    .populate('approvedBy', 'name')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  ok(res, { data: records });
});

export const createProcurement = asyncHandler(async (req, res) => {
  const record = await Procurement.create({
    ...req.body,
    school: req.schoolId,
    branch: req.branchId || req.body.branch,
    createdBy: req.user._id
  });
  logAction(req, { action: 'CREATE_PROCUREMENT', module: 'PROCUREMENT', targetId: record._id });
  ok(res, { data: record });
});

export const updateProcurement = asyncHandler(async (req, res) => {
  const record = await Procurement.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { ...req.body, updatedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Procurement record not found' });
  logAction(req, { action: 'UPDATE_PROCUREMENT', module: 'PROCUREMENT', targetId: record._id });
  ok(res, { data: record });
});

export const deleteProcurement = asyncHandler(async (req, res) => {
  const record = await Procurement.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Procurement record not found' });
  logAction(req, { action: 'DELETE_PROCUREMENT', module: 'PROCUREMENT', targetId: record._id });
  ok(res, { message: 'Procurement record archived', data: record });
});

// ============ Enterprise Finance
export const getEnterpriseFinance = asyncHandler(async (req, res) => {
  const records = await EnterpriseFinance.find({ ...tenantFilter(req, active) })
    .populate('approvedBy', 'name')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  ok(res, { data: records });
});

export const createEnterpriseFinance = asyncHandler(async (req, res) => {
  const record = await EnterpriseFinance.create({
    ...req.body,
    school: req.schoolId,
    branch: req.branchId || req.body.branch,
    createdBy: req.user._id
  });
  logAction(req, { action: 'CREATE_ENTERPRISE_FINANCE', module: 'FINANCE', targetId: record._id });
  ok(res, { data: record });
});

export const updateEnterpriseFinance = asyncHandler(async (req, res) => {
  const record = await EnterpriseFinance.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { ...req.body, updatedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Enterprise finance record not found' });
  logAction(req, { action: 'UPDATE_ENTERPRISE_FINANCE', module: 'FINANCE', targetId: record._id });
  ok(res, { data: record });
});

export const deleteEnterpriseFinance = asyncHandler(async (req, res) => {
  const record = await EnterpriseFinance.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Enterprise finance record not found' });
  logAction(req, { action: 'DELETE_ENTERPRISE_FINANCE', module: 'FINANCE', targetId: record._id });
  ok(res, { message: 'Enterprise finance record archived', data: record });
});

// ============ Revenue Forecast
export const getRevenueForecasts = asyncHandler(async (req, res) => {
  const records = await RevenueForecast.find({ ...tenantFilter(req, active) })
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  ok(res, { data: records });
});

export const createRevenueForecast = asyncHandler(async (req, res) => {
  const record = await RevenueForecast.create({
    ...req.body,
    school: req.schoolId,
    branch: req.branchId || req.body.branch,
    createdBy: req.user._id
  });
  logAction(req, { action: 'CREATE_REVENUE_FORECAST', module: 'FINANCE', targetId: record._id });
  ok(res, { data: record });
});

export const updateRevenueForecast = asyncHandler(async (req, res) => {
  const record = await RevenueForecast.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { ...req.body, updatedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Revenue forecast not found' });
  logAction(req, { action: 'UPDATE_REVENUE_FORECAST', module: 'FINANCE', targetId: record._id });
  ok(res, { data: record });
});

export const deleteRevenueForecast = asyncHandler(async (req, res) => {
  const record = await RevenueForecast.findOneAndUpdate({ ...tenantFilter(req, active), _id: req.params.id }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }, { new: true });
  if (!record) return res.status(404).json({ success: false, message: 'Revenue forecast not found' });
  logAction(req, { action: 'DELETE_REVENUE_FORECAST', module: 'FINANCE', targetId: record._id });
  ok(res, { message: 'Revenue forecast archived', data: record });
});

// ============ Payroll Management — delegated to dedicated payrollController.js
// These stubs stay for backward compat with the enterprise route; the real
// implementation lives in src/controllers/payrollController.js
export const getPayrolls = asyncHandler(async (req, res) => {
  const records = await Payroll.find({ ...tenantFilter(req, active) })
    .populate('user', 'name customId role')
    .populate('createdBy', 'name')
    .sort({ year: -1, month: -1 });
  ok(res, { data: records });
});

export const createPayroll = asyncHandler(async (req, res) => {
  const record = await Payroll.create({
    ...req.body,
    school: req.schoolId,
    branch: req.branchId || req.body.branch,
    createdBy: req.user._id
  });
  logAction(req, { action: 'CREATE_PAYROLL', module: 'FINANCE', targetId: record._id });
  ok(res, { data: record });
});

export const updatePayroll = asyncHandler(async (req, res) => {
  const record = await Payroll.findOneAndUpdate(
    { ...tenantFilter(req, active), _id: req.params.id },
    { ...req.body, updatedBy: req.user._id },
    { new: true }
  );
  if (!record) return res.status(404).json({ success: false, message: 'Payroll record not found' });
  logAction(req, { action: 'UPDATE_PAYROLL', module: 'FINANCE', targetId: record._id });
  ok(res, { data: record });
});

export const deletePayroll = asyncHandler(async (req, res) => {
  const record = await Payroll.findOneAndUpdate(
    { ...tenantFilter(req, active), _id: req.params.id },
    { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id },
    { new: true }
  );
  if (!record) return res.status(404).json({ success: false, message: 'Payroll record not found' });
  logAction(req, { action: 'DELETE_PAYROLL', module: 'FINANCE', targetId: record._id });
  ok(res, { message: 'Payroll record archived', data: record });
});

// ============ Analytics & Reports
export const getBusinessIntelligence = asyncHandler(async (req, res) => {
  const filter = tenantFilter(req, active);
  const [students, teachers, classes, totalRevenue, attendanceStats] = await Promise.all([
    User.countDocuments({ ...filter, role: 'student' }),
    User.countDocuments({ ...filter, role: 'teacher' }),
    Class.countDocuments(filter),
    Payment.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Attendance.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  ok(res, { data: { students, teachers, classes, totalRevenue: totalRevenue[0]?.total || 0, attendanceStats } });
});

export const getExecutiveDashboard = asyncHandler(async (req, res) => {
  const filter = tenantFilter(req, active);
  const [students, teachers, classes, revenue, attendance, marks] = await Promise.all([
    User.countDocuments({ ...filter, role: 'student' }),
    User.countDocuments({ ...filter, role: 'teacher' }),
    Class.countDocuments(filter),
    Payment.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Attendance.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Mark.aggregate([{ $match: filter }, { $group: { _id: null, avg: { $avg: '$total' } } }]),
  ]);
  ok(res, {
    data: {
      totalStudents: students,
      totalTeachers: teachers,
      totalClasses: classes,
      totalRevenue: revenue[0]?.total || 0,
      attendanceStats,
      averageMarks: marks[0]?.avg || 0
    }
  });
});
