import mongoose from 'mongoose';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import AcademicYear from '../models/AcademicYear.js';
import Schedule from '../models/Schedule.js';
import Attendance from '../models/Attendance.js';
import Exam from '../models/Exam.js';
import ExamHall from '../models/ExamHall.js';
import Admission from '../models/Admission.js';
import Certificate from '../models/Certificate.js';
import IDCardDesign from '../models/IDCardDesign.js';
import LibraryBook from '../models/LibraryBook.js';
import LibraryIssue from '../models/LibraryIssue.js';
import Asset from '../models/Asset.js';
import MonthlyPayment from '../models/MonthlyPayment.js';
import Payment from '../models/Payment.js';
import Discount from '../models/Discount.js';
import Notification from '../models/Notification.js';
import NotificationTemplate from '../models/NotificationTemplate.js';
import Announcement from '../models/Announcement.js';
import SchoolEvent from '../models/SchoolEvent.js';
import Document from '../models/Document.js';
import Hostel from '../models/Hostel.js';
import HostelRoom from '../models/HostelRoom.js';
import TransportRoute from '../models/TransportRoute.js';
import TransportVehicle from '../models/TransportVehicle.js';
import Role from '../models/Role.js';
import Permission from '../models/Permission.js';
import AuditLog from '../models/AuditLog.js';
import ApiActivityLog from '../models/ApiActivityLog.js';
import SupportTicket from '../models/SupportTicket.js';
import DataArchive from '../models/DataArchive.js';
import ScheduledReport from '../models/ScheduledReport.js';
import { tenantFilter, tenantBranchFilter } from '../utils/tenantQuery.js';

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeText = (value, fallback = '') => {
  if (value === null || value === undefined || value === '') return fallback;
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
};

const firstValue = (doc, fields, fallback = '') => {
  for (const field of fields) {
    const value = field.split('.').reduce((acc, key) => acc?.[key], doc);
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return fallback;
};

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const linkByType = {
  student: (doc) => `/students`,
  teacher: (doc) => `/teachers`,
  parent: () => '/parents',
  branch: () => '/branches',
  class: (doc) => `/classes/${doc._id}`,
  subject: () => '/subjects',
  academic_year: () => '/academic-years',
  schedule: () => '/schedule',
  attendance: () => '/attendance',
  exam: () => '/exams',
  exam_hall: () => '/exam-halls',
  admission: () => '/admissions',
  certificate: () => '/certificates',
  id_card: () => '/id-cards',
  library_book: () => '/library',
  book_borrowing: () => '/library',
  asset: () => '/assets',
  invoice: () => '/invoices',
  discount: () => '/discounts',
  payment: () => '/payments',
  revenue_report: () => '/revenue-reports',
  notification: () => '/notification-center',
  notification_template: () => '/notification-templates',
  announcement: () => '/announcements',
  school_event: () => '/events',
  document: () => '/documents',
  hostel: () => '/hostel',
  transport: () => '/transport',
  route: () => '/transport',
  vehicle: () => '/transport',
  role: () => '/roles',
  permission: () => '/permissions',
  user: () => '/settings',
  audit_log: () => '/audit',
  activity_timeline: () => '/activity',
  support_ticket: () => '/support',
  data_recovery: () => '/data-recovery',
  report: () => '/reports',
};

const typePermissions = {
  student: 'students.view',
  teacher: 'teachers.view',
  parent: 'students.view',
  branch: 'branches.view',
  class: 'classes.view',
  subject: 'subjects.view',
  academic_year: 'settings.view',
  schedule: 'schedules.view',
  attendance: 'attendance.view',
  exam: 'exams.view',
  exam_hall: 'exams.view',
  admission: 'students.view',
  certificate: 'students.view',
  id_card: 'students.view',
  library_book: 'settings.view',
  book_borrowing: 'settings.view',
  asset: 'settings.manage',
  invoice: 'finance.view',
  discount: 'finance.manage',
  payment: 'finance.view',
  revenue_report: 'finance.view',
  notification: 'notifications.view',
  notification_template: 'settings.manage',
  announcement: 'settings.view',
  school_event: 'settings.view',
  document: 'settings.view',
  hostel: 'settings.view',
  transport: 'settings.view',
  route: 'settings.view',
  vehicle: 'settings.view',
  role: 'rbac.roles.view',
  permission: 'rbac.permissions.view',
  user: 'settings.view',
  audit_log: 'settings.view',
  activity_timeline: 'settings.view',
  support_ticket: 'support.view',
  data_recovery: 'settings.manage',
  report: 'settings.view',
};

const teacherDefaultTypes = new Set([
  'student',
  'teacher',
  'class',
  'subject',
  'schedule',
  'attendance',
  'exam',
  'exam_hall',
  'announcement',
  'notification',
]);

const hasSearchAccess = (req, type) => {
  const role = req.user?.role;
  if (['schooladmin', 'school_admin', 'admin', 'branchmanager', 'branch_manager'].includes(role)) return true;

  const permissions = new Set(req.user?.permissions || []);
  const required = typePermissions[type];
  if (required && permissions.has(required)) return true;

  if (role === 'teacher') return teacherDefaultTypes.has(type);
  if (role === 'student') return ['student', 'schedule', 'attendance', 'exam', 'announcement', 'notification'].includes(type);
  if (role === 'parent') return ['student', 'schedule', 'attendance', 'exam', 'payment', 'announcement', 'notification'].includes(type);

  return false;
};

const makeSearch = ({
  type,
  label,
  Model,
  fields,
  title,
  subtitle,
  status,
  base = {},
  populate = [],
  branchAware = true,
  limit = 4,
}) => async (req, regex) => {
  if (!hasSearchAccess(req, type)) return [];

  const filter = branchAware ? await tenantBranchFilter(req, base) : tenantFilter(req, base);
  filter.$or = fields.map((field) => ({ [field]: regex }));

  const query = Model.find(filter).limit(limit).lean();
  populate.forEach((entry) => query.populate(entry));
  const docs = await query;

  return docs.map((doc) => {
    const itemTitle = normalizeText(typeof title === 'function' ? title(doc) : firstValue(doc, [title], label), label);
    const itemSubtitle = normalizeText(typeof subtitle === 'function' ? subtitle(doc) : firstValue(doc, [subtitle], label), label);
    const itemStatus = normalizeText(typeof status === 'function' ? status(doc) : firstValue(doc, [status], ''), '');
    const branchName = normalizeText(firstValue(doc, ['branch.name'], ''), '');

    return {
      id: doc._id,
      name: itemTitle,
      title: itemTitle,
      subtitle: itemSubtitle,
      type,
      typeLabel: label,
      branch: branchName,
      status: itemStatus,
      avatar: firstValue(doc, ['profileImage.secure_url', 'profileImage.url', 'avatar'], ''),
      initials: initials(itemTitle || label),
      link: linkByType[type]?.(doc) || '/',
      actionLabel: type.includes('invoice') ? 'Open Invoice' : type.includes('certificate') ? 'Open Certificate' : 'Open Details',
    };
  });
};

const searches = [
  makeSearch({
    type: 'student',
    label: 'Student',
    Model: User,
    base: { role: 'student', isDeleted: { $ne: true } },
    fields: ['name', 'customId', 'phone', 'parentPhone', 'parentName', 'email', 'parentEmail', 'metadata.nationalId', 'metadata.qrCodeId', 'metadata.admissionNumber'],
    title: 'name',
    subtitle: (doc) => `Student - ${doc.customId || doc.metadata?.admissionNumber || 'No ID'}`,
    status: 'status',
    populate: [{ path: 'branch', select: 'name' }],
    limit: 6,
  }),
  makeSearch({
    type: 'teacher',
    label: 'Teacher',
    Model: User,
    base: { role: 'teacher', isDeleted: { $ne: true } },
    fields: ['name', 'customId', 'phone', 'email', 'metadata.employeeNumber'],
    title: 'name',
    subtitle: (doc) => `Teacher - ${doc.customId || doc.metadata?.employeeNumber || 'No ID'}`,
    status: 'status',
    populate: [{ path: 'branch', select: 'name' }],
    limit: 6,
  }),
  makeSearch({
    type: 'parent',
    label: 'Parent',
    Model: User,
    base: { role: 'parent', isDeleted: { $ne: true } },
    fields: ['name', 'phone', 'email'],
    title: 'name',
    subtitle: (doc) => doc.phone || doc.email || 'Parent',
    status: 'status',
    populate: [{ path: 'branch', select: 'name' }],
  }),
  async (req, regex) => {
    if (!hasSearchAccess(req, 'branch')) return [];
    const branchQuery = {
      tenant: req.schoolId,
      isDeleted: { $ne: true },
      $or: [{ name: regex }, { code: regex }, { phone: regex }, { email: regex }, { principalName: regex }],
    };
    if (req.branchId && mongoose.Types.ObjectId.isValid(req.branchId)) branchQuery._id = req.branchId;
    const branches = await Branch.find(branchQuery).limit(5).lean();
    return branches.map((branch) => ({
      id: branch._id,
      name: branch.name,
      title: branch.name,
      subtitle: branch.code || branch.city || 'Branch',
      type: 'branch',
      typeLabel: 'Branch',
      branch: branch.name,
      status: branch.status,
      initials: initials(branch.name),
      link: '/branches',
      actionLabel: 'Open Branch',
    }));
  },
  makeSearch({ type: 'class', label: 'Class', Model: Class, base: { isDeleted: { $ne: true } }, fields: ['name', 'section', 'classCode'], title: (d) => [d.name, d.section].filter(Boolean).join(' '), subtitle: 'Class', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'subject', label: 'Subject', Model: Subject, base: { isDeleted: { $ne: true } }, fields: ['name', 'code'], title: 'name', subtitle: (d) => d.code || 'Subject', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'academic_year', label: 'Academic Year', Model: AcademicYear, fields: ['name', 'yearName', 'status'], title: (d) => d.yearName || d.name, subtitle: 'Academic Year', status: 'status' }),
  makeSearch({ type: 'schedule', label: 'Schedule', Model: Schedule, fields: ['day', 'subjectName', 'teacherName', 'room'], title: (d) => d.subjectName || d.day || 'Schedule', subtitle: (d) => [d.day, d.room].filter(Boolean).join(' - '), populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'attendance', label: 'Attendance', Model: Attendance, base: { deletedAt: { $exists: false } }, fields: ['status', 'remarks'], title: (d) => `Attendance - ${d.user?.name || d.status}`, subtitle: (d) => d.date ? new Date(d.date).toLocaleDateString() : 'Attendance', status: 'status', populate: [{ path: 'branch', select: 'name' }, { path: 'user', select: 'name customId' }] }),
  makeSearch({ type: 'exam', label: 'Exam', Model: Exam, base: { isDeleted: { $ne: true } }, fields: ['name', 'type', 'status'], title: 'name', subtitle: (d) => d.type || 'Exam', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'exam_hall', label: 'Exam Hall', Model: ExamHall, fields: ['name', 'location', 'status'], title: 'name', subtitle: (d) => d.location || 'Exam Hall', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'admission', label: 'Admission', Model: Admission, fields: ['studentName', 'email', 'phone', 'parentName', 'parentPhone', 'applicationNumber'], title: 'studentName', subtitle: (d) => d.applicationNumber || d.parentPhone || 'Admission', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'certificate', label: 'Certificate', Model: Certificate, fields: ['title', 'type', 'verificationNumber'], title: 'title', subtitle: (d) => d.student?.name || d.verificationNumber || 'Certificate', status: 'status', populate: [{ path: 'branch', select: 'name' }, { path: 'student', select: 'name customId' }] }),
  makeSearch({ type: 'id_card', label: 'ID Card', Model: IDCardDesign, fields: ['name', 'templateName'], title: (d) => d.name || d.templateName || 'ID Card', subtitle: 'ID Card', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'library_book', label: 'Library Book', Model: LibraryBook, base: { deletedAt: { $exists: false } }, fields: ['title', 'author', 'isbn', 'category', 'rackNumber'], title: 'title', subtitle: (d) => d.author || d.isbn || 'Library Book', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'book_borrowing', label: 'Book Borrowing', Model: LibraryIssue, fields: ['status', 'remarks'], title: (d) => `Borrowing - ${d.book?.title || d.status}`, subtitle: (d) => d.user?.name || 'Book Borrowing', status: 'status', populate: [{ path: 'branch', select: 'name' }, { path: 'book', select: 'title' }, { path: 'user', select: 'name' }] }),
  makeSearch({ type: 'asset', label: 'Asset', Model: Asset, fields: ['name', 'category', 'location', 'serialNumber', 'status'], title: 'name', subtitle: (d) => d.serialNumber || d.category || 'Asset', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'invoice', label: 'Invoice', Model: MonthlyPayment, base: { isDeleted: { $ne: true } }, fields: ['month', 'monthLabel', 'status', 'remarks', 'academicYear'], title: (d) => `Invoice - ${d.monthLabel || `${d.month} ${d.year}`}`, subtitle: (d) => d.student?.name || `Amount ${d.amount || 0}`, status: 'status', populate: [{ path: 'branch', select: 'name' }, { path: 'student', select: 'name customId' }] }),
  makeSearch({ type: 'payment', label: 'Payment', Model: Payment, fields: ['status', 'method', 'reference', 'remarks'], title: (d) => `Payment - ${d.reference || d._id.toString().slice(-6)}`, subtitle: (d) => d.status || 'Payment', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'discount', label: 'Discount', Model: Discount, fields: ['name', 'type', 'description'], title: 'name', subtitle: (d) => d.type || 'Discount', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'notification', label: 'Notification', Model: Notification, fields: ['title', 'message', 'type', 'priority', 'status'], title: 'title', subtitle: 'message', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'notification_template', label: 'Notification Template', Model: NotificationTemplate, fields: ['name', 'title', 'subject', 'type'], title: (d) => d.name || d.title || d.subject, subtitle: 'type', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'announcement', label: 'Announcement', Model: Announcement, fields: ['title', 'content', 'message', 'priority', 'status'], title: 'title', subtitle: (d) => d.priority || 'Announcement', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'school_event', label: 'School Event', Model: SchoolEvent, fields: ['title', 'description', 'location', 'status'], title: 'title', subtitle: (d) => d.location || 'School Event', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'document', label: 'Document', Model: Document, base: { isDeleted: { $ne: true } }, fields: ['title', 'type', 'status'], title: 'title', subtitle: 'type', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'hostel', label: 'Hostel', Model: Hostel, fields: ['name', 'location', 'status'], title: 'name', subtitle: (d) => d.location || 'Hostel', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'hostel_room', label: 'Hostel Room', Model: HostelRoom, fields: ['roomNumber', 'type', 'status'], title: (d) => `Room ${d.roomNumber || ''}`, subtitle: 'type', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'route', label: 'Route', Model: TransportRoute, fields: ['name', 'startPoint', 'endPoint', 'status'], title: 'name', subtitle: (d) => [d.startPoint, d.endPoint].filter(Boolean).join(' to ') || 'Route', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'vehicle', label: 'Vehicle', Model: TransportVehicle, fields: ['plateNumber', 'model', 'driverName', 'status'], title: (d) => d.plateNumber || d.model || 'Vehicle', subtitle: (d) => d.driverName || 'Vehicle', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'role', label: 'Role', Model: Role, fields: ['name', 'description'], title: 'name', subtitle: 'description', status: 'status' }),
  makeSearch({ type: 'permission', label: 'Permission', Model: Permission, fields: ['name', 'code', 'module', 'description'], title: (d) => d.name || d.code, subtitle: 'module', status: 'status' }),
  makeSearch({ type: 'user', label: 'User', Model: User, base: { isDeleted: { $ne: true } }, fields: ['name', 'email', 'phone', 'role', 'customId'], title: 'name', subtitle: (d) => d.email || d.role || 'User', status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
  makeSearch({ type: 'audit_log', label: 'Audit Log', Model: AuditLog, fields: ['action', 'entityType', 'details', 'module'], title: (d) => d.action || 'Audit Log', subtitle: (d) => d.entityType || d.module || 'Audit Log', status: 'status' }),
  makeSearch({ type: 'activity_timeline', label: 'Activity Timeline', Model: ApiActivityLog, fields: ['method', 'path', 'statusCode', 'userAgent'], title: (d) => `${d.method || 'Activity'} ${d.path || ''}`.trim(), subtitle: (d) => d.statusCode || 'Activity', status: 'status' }),
  makeSearch({ type: 'support_ticket', label: 'Support Ticket', Model: SupportTicket, fields: ['subject', 'message', 'status', 'priority'], title: 'subject', subtitle: (d) => d.priority || 'Support Ticket', status: 'status' }),
  makeSearch({ type: 'data_recovery', label: 'Data Recovery', Model: DataArchive, fields: ['entityType', 'reason', 'status'], title: (d) => d.entityType || 'Archived Record', subtitle: (d) => d.reason || 'Data Recovery', status: 'status' }),
  makeSearch({ type: 'report', label: 'Report', Model: ScheduledReport, fields: ['name', 'type', 'frequency', 'status'], title: 'name', subtitle: (d) => d.type || d.frequency || 'Report', status: 'status' }),
  makeSearch({ type: 'revenue_report', label: 'Revenue Report', Model: MonthlyPayment, base: { isDeleted: { $ne: true } }, fields: ['month', 'monthLabel', 'status', 'academicYear'], title: (d) => `Revenue - ${d.monthLabel || d.month}`, subtitle: (d) => `${d.status || 'Payment'} ${d.amount || ''}`.trim(), status: 'status', populate: [{ path: 'branch', select: 'name' }] }),
];

/**
 * @desc    Perform a global search across tenant/branch-scoped ERP entities
 * @route   GET /api/search/global?q=query
 * @access  Private
 */
export const globalSearch = async (req, res) => {
  const q = (req.query.q || req.query.query || '').trim();

  if (!req.schoolId) {
    return res.status(403).json({
      success: false,
      message: 'Tenant context required for global search',
    });
  }

  if (!q || q.length < 2) {
    return res.json({ success: true, results: [] });
  }

  try {
    const regex = new RegExp(escapeRegex(q), 'i');
    const settled = await Promise.allSettled(searches.map((search) => search(req, regex)));
    const results = settled
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .slice(0, 50);

    res.json({
      success: true,
      query: q,
      tenantId: req.schoolId,
      branchId: req.branchId || null,
      results,
    });
  } catch (error) {
    console.error('[GlobalSearch] Error:', error.message);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};
