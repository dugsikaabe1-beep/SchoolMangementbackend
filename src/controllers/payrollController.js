/**
 * Payroll Controller — complete business logic
 * Salary calculation, bulk payroll run, payslip PDF, approval workflow
 */
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Payroll from '../models/Payroll.js';
import SalaryStructure from '../models/SalaryStructure.js';
import User from '../models/User.js';
import School from '../models/School.js';
import { tenantFilter } from '../utils/tenantQuery.js';
import { logAction } from '../utils/auditLogger.js';
import { generatePdf } from '../utils/pdfGenerator.js';

const ok  = (res, data = {}) => res.json({ success: true, ...data });
const err = (res, status, msg) => res.status(status).json({ success: false, message: msg });

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

// ── Utility: compute payroll figures from structure + overrides ───────────────
const computePayroll = (basicSalary, components = [], taxRate = 0) => {
  let totalAllowances = 0;
  let totalDeductions = 0;
  let taxableIncome   = basicSalary;

  const allowanceItems = [];
  const deductionItems = [];

  for (const comp of components) {
    if (!comp.isActive) continue;
    const raw   = comp.calcType === 'percentage'
      ? (basicSalary * comp.value) / 100
      : comp.value;
    const amount = Math.round(raw * 100) / 100;

    if (comp.type === 'allowance') {
      allowanceItems.push({ name: comp.name, type: comp.calcType, value: comp.value, amount, isTaxable: comp.isTaxable });
      totalAllowances += amount;
      if (comp.isTaxable) taxableIncome += amount;
    } else {
      deductionItems.push({ name: comp.name, type: comp.calcType, value: comp.value, amount, isStatutory: comp.isStatutory });
      totalDeductions += amount;
    }
  }

  const grossSalary = basicSalary + totalAllowances;
  const taxAmount   = taxRate > 0 ? Math.round((taxableIncome * taxRate) / 100 * 100) / 100 : 0;
  totalDeductions   = Math.round((totalDeductions + taxAmount) * 100) / 100;
  const netSalary   = Math.max(0, Math.round((grossSalary - totalDeductions) * 100) / 100);

  return { allowanceItems, deductionItems, totalAllowances, totalDeductions,
    grossSalary, taxableIncome, taxAmount, netSalary };
};

// ── Salary Structures ─────────────────────────────────────────────────────────

export const getSalaryStructures = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: { $ne: true } };
  const structures = await SalaryStructure.find(filter)
    .populate('createdBy', 'name')
    .sort({ name: 1 });
  ok(res, { data: structures });
});

export const getSalaryStructureById = asyncHandler(async (req, res) => {
  const structure = await SalaryStructure.findOne({
    ...tenantFilter(req), _id: req.params.id, isDeleted: { $ne: true },
  });
  if (!structure) return err(res, 404, 'Salary structure not found');
  ok(res, { data: structure });
});

export const createSalaryStructure = asyncHandler(async (req, res) => {
  const { name, basicSalary, components, taxRate, currency, description, isDefault } = req.body;

  if (!name?.trim()) return err(res, 400, 'Structure name is required');
  if (!basicSalary || basicSalary < 0) return err(res, 400, 'Valid basic salary is required');

  // Enforce single default per school
  if (isDefault) {
    await SalaryStructure.updateMany(
      { school: req.schoolId, isDeleted: { $ne: true } },
      { isDefault: false }
    );
  }

  const exists = await SalaryStructure.findOne({
    school: req.schoolId, name: name.trim(), isDeleted: { $ne: true },
  });
  if (exists) return err(res, 400, 'A salary structure with this name already exists');

  const structure = await SalaryStructure.create({
    school: req.schoolId, branch: req.branchId || undefined,
    name: name.trim(), description, basicSalary, components: components || [],
    taxRate: taxRate || 0, currency: currency || 'USD',
    isDefault: Boolean(isDefault), createdBy: req.user._id,
  });

  logAction(req, { action: 'CREATE_SALARY_STRUCTURE', module: 'PAYROLL', targetId: structure._id });
  ok(res, { data: structure });
});

export const updateSalaryStructure = asyncHandler(async (req, res) => {
  const { isDefault } = req.body;
  if (isDefault) {
    await SalaryStructure.updateMany(
      { school: req.schoolId, _id: { $ne: req.params.id }, isDeleted: { $ne: true } },
      { isDefault: false }
    );
  }
  const structure = await SalaryStructure.findOneAndUpdate(
    { ...tenantFilter(req), _id: req.params.id, isDeleted: { $ne: true } },
    { ...req.body, updatedBy: req.user._id },
    { new: true, runValidators: true }
  );
  if (!structure) return err(res, 404, 'Salary structure not found');
  logAction(req, { action: 'UPDATE_SALARY_STRUCTURE', module: 'PAYROLL', targetId: structure._id });
  ok(res, { data: structure });
});

export const deleteSalaryStructure = asyncHandler(async (req, res) => {
  const structure = await SalaryStructure.findOneAndUpdate(
    { ...tenantFilter(req), _id: req.params.id, isDeleted: { $ne: true } },
    { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id },
    { new: true }
  );
  if (!structure) return err(res, 404, 'Salary structure not found');
  logAction(req, { action: 'DELETE_SALARY_STRUCTURE', module: 'PAYROLL', targetId: structure._id });
  ok(res, { message: 'Salary structure deleted' });
});

export const previewSalaryCalculation = asyncHandler(async (req, res) => {
  const { basicSalary, components, taxRate } = req.body;
  if (!basicSalary || basicSalary < 0) return err(res, 400, 'Valid basic salary required');
  const result = computePayroll(basicSalary, components || [], taxRate || 0);
  ok(res, { data: result });
});

// ── Individual Payroll Records ────────────────────────────────────────────────

export const getPayrolls = asyncHandler(async (req, res) => {
  const { month, year, status, userId, page = 1, limit = 50 } = req.query;
  const filter = { ...tenantFilter(req), isDeleted: { $ne: true } };

  if (month)  filter.month  = Number(month);
  if (year)   filter.year   = Number(year);
  if (status) filter.status = status;
  if (userId) filter.user   = userId;

  const skip  = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    Payroll.find(filter)
      .populate('user', 'name customId role profileImage')
      .populate('approvedBy', 'name')
      .populate('salaryStructure', 'name')
      .sort({ year: -1, month: -1, createdAt: -1 })
      .skip(skip).limit(Number(limit)),
    Payroll.countDocuments(filter),
  ]);

  ok(res, { data: records, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

export const getPayrollById = asyncHandler(async (req, res) => {
  const record = await Payroll.findOne({
    ...tenantFilter(req), _id: req.params.id, isDeleted: { $ne: true },
  })
    .populate('user', 'name customId role phone email profileImage')
    .populate('approvedBy', 'name')
    .populate('salaryStructure', 'name currency');
  if (!record) return err(res, 404, 'Payroll record not found');
  ok(res, { data: record });
});

export const createPayroll = asyncHandler(async (req, res) => {
  const { userId, month, year, salaryStructureId, basicSalary: manualBasic,
    components: overrideComponents, taxRate: overrideTaxRate,
    paymentMethod, bankName, accountNumber, remarks } = req.body;

  if (!userId || !month || !year) return err(res, 400, 'userId, month, and year are required');
  if (month < 1 || month > 12) return err(res, 400, 'Month must be between 1 and 12');

  // Verify employee belongs to this school
  const employee = await User.findOne({
    _id: userId, school: req.schoolId, isDeleted: { $ne: true },
    role: { $in: ['teacher', 'accountant', 'school_admin', 'schooladmin', 'admin'] },
  });
  if (!employee) return err(res, 404, 'Employee not found in this school');

  // Prevent duplicate for same period
  const duplicate = await Payroll.findOne({
    ...tenantFilter(req), user: userId, month: Number(month), year: Number(year), isDeleted: { $ne: true },
  });
  if (duplicate) return err(res, 400, `Payroll already exists for this employee for ${MONTH_NAMES[month - 1]} ${year}`);

  // Resolve salary structure
  let structure = null;
  if (salaryStructureId) {
    structure = await SalaryStructure.findOne({ _id: salaryStructureId, school: req.schoolId, isDeleted: { $ne: true } });
  }

  const basicSalary     = manualBasic ?? structure?.basicSalary ?? 0;
  const compsToUse      = overrideComponents ?? structure?.components ?? [];
  const taxRate         = overrideTaxRate    ?? structure?.taxRate    ?? 0;

  if (basicSalary < 0) return err(res, 400, 'Basic salary cannot be negative');

  const computed = computePayroll(basicSalary, compsToUse, taxRate);

  // Generate payslip number
  const seq          = await Payroll.countDocuments({ school: req.schoolId }) + 1;
  const payslipNumber = `PAY-${year}-${String(month).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;

  const record = await Payroll.create({
    school: req.schoolId, branch: req.branchId,
    user: userId, month: Number(month), year: Number(year),
    basicSalary, ...computed,
    taxRate, payslipNumber, salaryStructure: structure?._id,
    paymentMethod, bankName, accountNumber, remarks,
    createdBy: req.user._id,
  });

  logAction(req, { action: 'CREATE_PAYROLL', module: 'PAYROLL', targetId: record._id,
    details: { employee: employee.name, month, year, netSalary: computed.netSalary } });
  ok(res, { data: record });
});

export const updatePayroll = asyncHandler(async (req, res) => {
  const existing = await Payroll.findOne({
    ...tenantFilter(req), _id: req.params.id, isDeleted: { $ne: true },
  });
  if (!existing) return err(res, 404, 'Payroll record not found');
  if (existing.status === 'Paid') return err(res, 400, 'Cannot edit a paid payroll record');

  // Re-calculate if salary-related fields changed
  if (req.body.basicSalary !== undefined || req.body.components || req.body.taxRate !== undefined) {
    const basic  = req.body.basicSalary  ?? existing.basicSalary;
    const comps  = req.body.components   ?? existing.allowanceItems.concat(existing.deductionItems);
    const taxRt  = req.body.taxRate      ?? existing.taxRate;
    const computed = computePayroll(basic, comps, taxRt);
    Object.assign(req.body, computed);
  }

  const record = await Payroll.findOneAndUpdate(
    { ...tenantFilter(req), _id: req.params.id, isDeleted: { $ne: true } },
    { ...req.body, updatedBy: req.user._id },
    { new: true, runValidators: true }
  ).populate('user', 'name customId');

  logAction(req, { action: 'UPDATE_PAYROLL', module: 'PAYROLL', targetId: record._id });
  ok(res, { data: record });
});

export const deletePayroll = asyncHandler(async (req, res) => {
  const record = await Payroll.findOne({ ...tenantFilter(req), _id: req.params.id, isDeleted: { $ne: true } });
  if (!record) return err(res, 404, 'Payroll record not found');
  if (record.status === 'Paid') return err(res, 400, 'Cannot delete a paid payroll record');

  record.isDeleted  = true;
  record.deletedAt  = new Date();
  record.deletedBy  = req.user._id;
  await record.save();

  logAction(req, { action: 'DELETE_PAYROLL', module: 'PAYROLL', targetId: record._id });
  ok(res, { message: 'Payroll record deleted' });
});

// ── Approval Workflow ─────────────────────────────────────────────────────────

export const approvePayroll = asyncHandler(async (req, res) => {
  const record = await Payroll.findOneAndUpdate(
    { ...tenantFilter(req), _id: req.params.id, status: 'Draft', isDeleted: { $ne: true } },
    { status: 'Approved', approvedBy: req.user._id, approvedAt: new Date(), updatedBy: req.user._id },
    { new: true }
  ).populate('user', 'name customId');
  if (!record) return err(res, 404, 'Payroll record not found or already processed');
  logAction(req, { action: 'APPROVE_PAYROLL', module: 'PAYROLL', targetId: record._id });
  ok(res, { data: record });
});

export const markPayrollPaid = asyncHandler(async (req, res) => {
  const { paymentDate, paymentMethod, transactionRef } = req.body;
  const record = await Payroll.findOneAndUpdate(
    { ...tenantFilter(req), _id: req.params.id, status: { $in: ['Draft', 'Approved'] }, isDeleted: { $ne: true } },
    {
      status: 'Paid',
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentMethod: paymentMethod || undefined,
      transactionRef: transactionRef || undefined,
      updatedBy: req.user._id,
    },
    { new: true }
  ).populate('user', 'name customId');
  if (!record) return err(res, 404, 'Payroll record not found or already paid');
  logAction(req, { action: 'MARK_PAYROLL_PAID', module: 'PAYROLL', targetId: record._id,
    details: { paymentDate, paymentMethod, transactionRef } });
  ok(res, { data: record });
});

// ── Bulk Payroll Run ──────────────────────────────────────────────────────────

export const runBulkPayroll = asyncHandler(async (req, res) => {
  const { month, year, salaryStructureId, useIndividualStructures = true } = req.body;
  if (!month || !year) return err(res, 400, 'month and year are required');

  const employees = await User.find({
    school: req.schoolId,
    ...(req.branchId ? { branch: req.branchId } : {}),
    role: { $in: ['teacher', 'accountant'] },
    status: 'active',
    isDeleted: { $ne: true },
  }).select('_id name customId monthlyFees');

  if (!employees.length) return err(res, 400, 'No active employees found');

  let defaultStructure = null;
  if (salaryStructureId) {
    defaultStructure = await SalaryStructure.findOne({ _id: salaryStructureId, school: req.schoolId, isDeleted: { $ne: true } });
  } else {
    defaultStructure = await SalaryStructure.findOne({ school: req.schoolId, isDefault: true, isDeleted: { $ne: true } });
  }

  const results = { created: [], skipped: [], errors: [] };

  for (const emp of employees) {
    try {
      const alreadyExists = await Payroll.findOne({
        ...tenantFilter(req), user: emp._id, month: Number(month), year: Number(year), isDeleted: { $ne: true },
      });
      if (alreadyExists) { results.skipped.push({ id: emp._id, name: emp.name, reason: 'Already exists' }); continue; }

      const structure  = defaultStructure;
      const basicSalary = emp.monthlyFees || structure?.basicSalary || 0;
      const components  = structure?.components || [];
      const taxRate     = structure?.taxRate || 0;
      const computed    = computePayroll(basicSalary, components, taxRate);

      const seq           = await Payroll.countDocuments({ school: req.schoolId }) + 1;
      const payslipNumber = `PAY-${year}-${String(month).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;

      const record = await Payroll.create({
        school: req.schoolId, branch: req.branchId,
        user: emp._id, month: Number(month), year: Number(year),
        basicSalary, ...computed, taxRate, payslipNumber,
        salaryStructure: structure?._id,
        createdBy: req.user._id,
      });
      results.created.push({ id: record._id, name: emp.name, netSalary: computed.netSalary });
    } catch (e) {
      results.errors.push({ name: emp.name, error: e.message });
    }
  }

  logAction(req, { action: 'BULK_PAYROLL_RUN', module: 'PAYROLL',
    details: { month, year, created: results.created.length, skipped: results.skipped.length } });
  ok(res, { data: results, summary: { total: employees.length, created: results.created.length,
    skipped: results.skipped.length, errors: results.errors.length } });
});

// ── Payroll Stats / Summary ───────────────────────────────────────────────────

export const getPayrollStats = asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  const filter = { ...tenantFilter(req), isDeleted: { $ne: true } };
  if (year)  filter.year  = Number(year);
  if (month) filter.month = Number(month);

  const [stats, byStatus] = await Promise.all([
    Payroll.aggregate([
      { $match: filter },
      { $group: {
        _id: null,
        totalGross:  { $sum: '$grossSalary' },
        totalNet:    { $sum: '$netSalary' },
        totalTax:    { $sum: '$taxAmount' },
        totalDeduc:  { $sum: '$totalDeductions' },
        count:       { $sum: 1 },
      }},
    ]),
    Payroll.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 }, totalNet: { $sum: '$netSalary' } }},
    ]),
  ]);

  ok(res, { data: { summary: stats[0] || {}, byStatus } });
});

// ── Payslip PDF ───────────────────────────────────────────────────────────────

export const downloadPayslip = asyncHandler(async (req, res) => {
  const record = await Payroll.findOne({
    ...tenantFilter(req), _id: req.params.id, isDeleted: { $ne: true },
  })
    .populate('user', 'name customId email phone profileImage')
    .populate('approvedBy', 'name')
    .populate('salaryStructure', 'name currency');

  if (!record) return err(res, 404, 'Payroll record not found');

  const school = await School.findById(req.schoolId).select('name logo address phone');

  const data = {
    schoolName:     school?.name || 'School',
    schoolAddress:  school?.address || '',
    schoolPhone:    school?.phone || '',
    schoolLogo:     school?.logo?.url || '',
    employeeName:   record.user?.name || 'Employee',
    employeeId:     record.user?.customId || '',
    employeeEmail:  record.user?.email || '',
    payslipNumber:  record.payslipNumber,
    period:         `${MONTH_NAMES[record.month - 1]} ${record.year}`,
    basicSalary:    record.basicSalary.toFixed(2),
    allowanceItems: record.allowanceItems,
    deductionItems: record.deductionItems,
    totalAllowances:record.totalAllowances.toFixed(2),
    totalDeductions:record.totalDeductions.toFixed(2),
    grossSalary:    record.grossSalary.toFixed(2),
    taxAmount:      record.taxAmount.toFixed(2),
    netSalary:      record.netSalary.toFixed(2),
    status:         record.status,
    paymentDate:    record.paymentDate ? record.paymentDate.toLocaleDateString() : 'Pending',
    paymentMethod:  record.paymentMethod || '',
    currency:       record.salaryStructure?.currency || 'USD',
    generatedAt:    new Date().toLocaleDateString(),
  };

  try {
    const pdfBuffer = await generatePdf('payslip', data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${record.payslipNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (pdfErr) {
    // Fallback: return JSON if PDF generation fails
    console.error('[Payroll] PDF generation failed:', pdfErr.message);
    ok(res, { data });
  }
});
