import asyncHandler from 'express-async-handler';
import FuelLog from '../models/FuelLog.js';
import VehicleMaintenance from '../models/VehicleMaintenance.js';
import TransportAllocation from '../models/TransportAllocation.js';
import { tenantFilter } from '../utils/tenantQuery.js';
import { logAction } from '../utils/auditLogger.js';

const ok = (res, data = {}) => res.json({ success: true, ...data });
const err = (res, s, msg) => res.status(s).json({ success: false, message: msg });

// ── FUEL LOGS ────────────────────────────────────────────────────────────────

export const getFuelLogs = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { vehicleId, page = 1, limit = 20 } = req.query;
  if (vehicleId) filter.vehicle = vehicleId;
  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    FuelLog.find(filter).populate('vehicle', 'name plateNumber').populate('driver', 'name').sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    FuelLog.countDocuments(filter),
  ]);
  ok(res, { data: logs, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createFuelLog = asyncHandler(async (req, res) => {
  const { vehicleId, date, liters, costPerLiter, odometer, fuelType, station, notes } = req.body;
  if (!vehicleId || !liters || !costPerLiter) return err(res, 400, 'Vehicle, liters, and cost required');
  const totalCost = liters * costPerLiter;
  const log = await FuelLog.create({ ...tenantFilter(req), vehicle: vehicleId, date, liters, costPerLiter, totalCost, odometer, fuelType, station, driver: req.user._id, notes });
  ok(res, { data: log }, 201);
});

// ── VEHICLE MAINTENANCE ──────────────────────────────────────────────────────

export const getVehicleMaintenance = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { vehicleId, status, type, page = 1, limit = 20 } = req.query;
  if (vehicleId) filter.vehicle = vehicleId;
  if (status) filter.status = status;
  if (type) filter.type = type;
  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    VehicleMaintenance.find(filter).populate('vehicle', 'name plateNumber').sort({ scheduledDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    VehicleMaintenance.countDocuments(filter),
  ]);
  ok(res, { data: records, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createVehicleMaintenance = asyncHandler(async (req, res) => {
  const { vehicleId, type, description, scheduledDate, cost, vendor, priority, notes } = req.body;
  if (!vehicleId || !type || !description || !scheduledDate) return err(res, 400, 'Vehicle, type, description, and date required');
  const record = await VehicleMaintenance.create({ ...tenantFilter(req), vehicle: vehicleId, type, description, scheduledDate, cost, vendor, priority, notes });
  ok(res, { data: record }, 201);
});

export const updateVehicleMaintenance = asyncHandler(async (req, res) => {
  const record = await VehicleMaintenance.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!record) return err(res, 404, 'Maintenance record not found');
  ok(res, { data: record });
});

// ── TRANSPORT ALLOCATIONS ────────────────────────────────────────────────────

export const getTransportAllocations = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { studentId, routeId, status, page = 1, limit = 20 } = req.query;
  if (studentId) filter.student = studentId;
  if (routeId) filter.route = routeId;
  if (status) filter.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [allocs, total] = await Promise.all([
    TransportAllocation.find(filter).populate('student', 'name').populate('route', 'name').populate('vehicle', 'name plateNumber').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    TransportAllocation.countDocuments(filter),
  ]);
  ok(res, { data: allocs, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createTransportAllocation = asyncHandler(async (req, res) => {
  const { studentId, routeId, vehicleId, pickupPoint, dropPoint, startDate, fee } = req.body;
  if (!studentId || !routeId) return err(res, 400, 'Student and route are required');
  const alloc = await TransportAllocation.create({ ...tenantFilter(req), academicYear: req.academicYearId, student: studentId, route: routeId, vehicle: vehicleId, pickupPoint, dropPoint, startDate, fee });
  ok(res, { data: alloc }, 201);
});

export const updateTransportAllocation = asyncHandler(async (req, res) => {
  const alloc = await TransportAllocation.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!alloc) return err(res, 404, 'Allocation not found');
  ok(res, { data: alloc });
});

export const deleteTransportAllocation = asyncHandler(async (req, res) => {
  const alloc = await TransportAllocation.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true }, { new: true });
  if (!alloc) return err(res, 404, 'Allocation not found');
  ok(res, { message: 'Allocation deleted' });
});
