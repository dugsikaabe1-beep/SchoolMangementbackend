import asyncHandler from 'express-async-handler';
import Department from '../models/Department.js';
import Designation from '../models/Designation.js';
import { tenantFilter } from '../utils/tenantQuery.js';
import { logAction } from '../utils/auditLogger.js';

const ok = (res, data = {}) => res.json({ success: true, ...data });
const err = (res, s, msg) => res.status(s).json({ success: false, message: msg });

// ── DEPARTMENTS ──────────────────────────────────────────────────────────────

export const getDepartments = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { status, search, page = 1, limit = 50 } = req.query;
  if (status) filter.status = status;
  if (search) filter.name = { $regex: search, $options: 'i' };

  const skip = (Number(page) - 1) * Number(limit);
  const [departments, total] = await Promise.all([
    Department.find(filter).populate('head', 'name email').sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
    Department.countDocuments(filter),
  ]);
  ok(res, { data: departments, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const getDepartmentById = asyncHandler(async (req, res) => {
  const dept = await Department.findOne({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }).populate('head', 'name email').lean();
  if (!dept) return err(res, 404, 'Department not found');
  ok(res, { data: dept });
});

export const createDepartment = asyncHandler(async (req, res) => {
  const { name, code, description, head } = req.body;
  if (!name) return err(res, 400, 'Name is required');
  const dept = await Department.create({ ...tenantFilter(req), name, code, description, head });
  await logAction(req, { action: 'CREATE', module: 'DEPARTMENT', targetId: dept._id, newValue: dept });
  ok(res, { data: dept }, 201);
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!dept) return err(res, 404, 'Department not found');
  await logAction(req, { action: 'UPDATE', module: 'DEPARTMENT', targetId: dept._id, newValue: dept });
  ok(res, { data: dept });
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true }, { new: true });
  if (!dept) return err(res, 404, 'Department not found');
  await logAction(req, { action: 'DELETE', module: 'DEPARTMENT', targetId: dept._id });
  ok(res, { message: 'Department deleted' });
});

// ── DESIGNATIONS ─────────────────────────────────────────────────────────────

export const getDesignations = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { status, department, search, page = 1, limit = 50 } = req.query;
  if (status) filter.status = status;
  if (department) filter.department = department;
  if (search) filter.name = { $regex: search, $options: 'i' };

  const skip = (Number(page) - 1) * Number(limit);
  const [designations, total] = await Promise.all([
    Designation.find(filter).populate('department', 'name').sort({ level: 1, name: 1 }).skip(skip).limit(Number(limit)).lean(),
    Designation.countDocuments(filter),
  ]);
  ok(res, { data: designations, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createDesignation = asyncHandler(async (req, res) => {
  const { name, code, description, department, level } = req.body;
  if (!name) return err(res, 400, 'Name is required');
  const desig = await Designation.create({ ...tenantFilter(req), name, code, description, department, level });
  await logAction(req, { action: 'CREATE', module: 'DESIGNATION', targetId: desig._id, newValue: desig });
  ok(res, { data: desig }, 201);
});

export const updateDesignation = asyncHandler(async (req, res) => {
  const desig = await Designation.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!desig) return err(res, 404, 'Designation not found');
  await logAction(req, { action: 'UPDATE', module: 'DESIGNATION', targetId: desig._id, newValue: desig });
  ok(res, { data: desig });
});

export const deleteDesignation = asyncHandler(async (req, res) => {
  const desig = await Designation.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true }, { new: true });
  if (!desig) return err(res, 404, 'Designation not found');
  await logAction(req, { action: 'DELETE', module: 'DESIGNATION', targetId: desig._id });
  ok(res, { message: 'Designation deleted' });
});
