import asyncHandler from 'express-async-handler';
import EmployeeLoan from '../models/EmployeeLoan.js';
import PerformanceReview from '../models/PerformanceReview.js';
import EmployeeContract from '../models/EmployeeContract.js';
import JobPosting from '../models/JobPosting.js';
import { tenantFilter } from '../utils/tenantQuery.js';
import { logAction } from '../utils/auditLogger.js';

const ok = (res, data = {}) => res.json({ success: true, ...data });
const err = (res, s, msg) => res.status(s).json({ success: false, message: msg });

// ── EMPLOYEE LOANS ───────────────────────────────────────────────────────────

export const getLoans = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { employeeId, status, page = 1, limit = 20 } = req.query;
  if (employeeId) filter.employee = employeeId;
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [loans, total] = await Promise.all([
    EmployeeLoan.find(filter).populate('employee', 'name email').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    EmployeeLoan.countDocuments(filter),
  ]);
  ok(res, { data: loans, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createLoan = asyncHandler(async (req, res) => {
  const { employeeId, loanType, amount, monthlyDeduction, startDate, endDate, reason } = req.body;
  if (!employeeId || !loanType || !amount) return err(res, 400, 'Employee, type, and amount are required');
  const loan = await EmployeeLoan.create({ ...tenantFilter(req), employee: employeeId, loanType, amount, outstandingAmount: amount, monthlyDeduction, startDate, endDate, reason });
  await logAction(req, { action: 'CREATE', module: 'EMPLOYEE_LOAN', targetId: loan._id });
  ok(res, { data: loan }, 201);
});

export const approveLoan = asyncHandler(async (req, res) => {
  const loan = await EmployeeLoan.findOne({ _id: req.params.id, ...tenantFilter(req), isDeleted: false });
  if (!loan) return err(res, 404, 'Loan not found');
  loan.status = 'active'; loan.approvedBy = req.user._id; loan.approvedAt = new Date();
  await loan.save();
  ok(res, { data: loan });
});

export const rejectLoan = asyncHandler(async (req, res) => {
  const loan = await EmployeeLoan.findOne({ _id: req.params.id, ...tenantFilter(req), isDeleted: false });
  if (!loan) return err(res, 404, 'Loan not found');
  loan.status = 'rejected'; loan.rejectedBy = req.user._id; loan.rejectedAt = new Date();
  await loan.save();
  ok(res, { data: loan });
});

// ── PERFORMANCE REVIEWS ──────────────────────────────────────────────────────

export const getReviews = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { employeeId, type, status, page = 1, limit = 20 } = req.query;
  if (employeeId) filter.employee = employeeId;
  if (type) filter.type = type;
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [reviews, total] = await Promise.all([
    PerformanceReview.find(filter).populate('employee', 'name email').populate('reviewer', 'name').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    PerformanceReview.countDocuments(filter),
  ]);
  ok(res, { data: reviews, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createReview = asyncHandler(async (req, res) => {
  const { employeeId, period, type, criteria, goals } = req.body;
  if (!employeeId || !period) return err(res, 400, 'Employee and period are required');
  const overallScore = criteria?.length ? criteria.reduce((s, c) => s + (c.score || 0), 0) / criteria.length : 0;
  const rating = overallScore >= 8 ? 'excellent' : overallScore >= 6 ? 'good' : overallScore >= 4 ? 'satisfactory' : overallScore >= 2 ? 'needs_improvement' : 'unsatisfactory';
  const review = await PerformanceReview.create({ ...tenantFilter(req), employee: employeeId, reviewer: req.user._id, period, type, criteria, goals, overallScore: Math.round(overallScore * 10) / 10, rating });
  await logAction(req, { action: 'CREATE', module: 'PERFORMANCE_REVIEW', targetId: review._id });
  ok(res, { data: review }, 201);
});

export const updateReview = asyncHandler(async (req, res) => {
  const review = await PerformanceReview.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!review) return err(res, 404, 'Review not found');
  ok(res, { data: review });
});

// ── EMPLOYEE CONTRACTS ───────────────────────────────────────────────────────

export const getContracts = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { employeeId, status, page = 1, limit = 20 } = req.query;
  if (employeeId) filter.employee = employeeId;
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [contracts, total] = await Promise.all([
    EmployeeContract.find(filter).populate('employee', 'name email').populate('department', 'name').populate('designation', 'name').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    EmployeeContract.countDocuments(filter),
  ]);
  ok(res, { data: contracts, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createContract = asyncHandler(async (req, res) => {
  const { employeeId, contractType, startDate, endDate, department, designation, salary, terms } = req.body;
  if (!employeeId || !contractType || !startDate) return err(res, 400, 'Employee, type, and start date required');
  const contract = await EmployeeContract.create({ ...tenantFilter(req), employee: employeeId, contractType, startDate, endDate, department, designation, salary, terms });
  await logAction(req, { action: 'CREATE', module: 'EMPLOYEE_CONTRACT', targetId: contract._id });
  ok(res, { data: contract }, 201);
});

export const updateContract = asyncHandler(async (req, res) => {
  const contract = await EmployeeContract.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!contract) return err(res, 404, 'Contract not found');
  ok(res, { data: contract });
});

// ── JOB POSTINGS (RECRUITMENT) ──────────────────────────────────────────────

export const getJobPostings = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { status, department, page = 1, limit = 20 } = req.query;
  if (status) filter.status = status;
  if (department) filter.department = department;

  const skip = (Number(page) - 1) * Number(limit);
  const [jobs, total] = await Promise.all([
    JobPosting.find(filter).populate('department', 'name').populate('designation', 'name').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    JobPosting.countDocuments(filter),
  ]);
  ok(res, { data: jobs, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createJobPosting = asyncHandler(async (req, res) => {
  const { title, department, designation, description, requirements, salaryRange, employmentType, openings, closingDate } = req.body;
  if (!title) return err(res, 400, 'Title is required');
  const job = await JobPosting.create({ ...tenantFilter(req), title, department, designation, description, requirements, salaryRange, employmentType, openings, closingDate, postedBy: req.user._id });
  await logAction(req, { action: 'CREATE', module: 'JOB_POSTING', targetId: job._id });
  ok(res, { data: job }, 201);
});

export const updateJobPosting = asyncHandler(async (req, res) => {
  const job = await JobPosting.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!job) return err(res, 404, 'Job posting not found');
  ok(res, { data: job });
});

export const deleteJobPosting = asyncHandler(async (req, res) => {
  const job = await JobPosting.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true }, { new: true });
  if (!job) return err(res, 404, 'Job posting not found');
  ok(res, { message: 'Job posting deleted' });
});
