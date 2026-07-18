import asyncHandler from 'express-async-handler';
import HostelAttendance from '../models/HostelAttendance.js';
import HostelBedAllocation from '../models/HostelBedAllocation.js';
import { tenantFilter } from '../utils/tenantQuery.js';

const ok = (res, data = {}) => res.json({ success: true, ...data });
const err = (res, s, msg) => res.status(s).json({ success: false, message: msg });

// ── HOSTEL ATTENDANCE ────────────────────────────────────────────────────────

export const getHostelAttendance = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { hostelId, studentId, date, status, page = 1, limit = 50 } = req.query;
  if (hostelId) filter.hostel = hostelId;
  if (studentId) filter.student = studentId;
  if (status) filter.status = status;
  if (date) { const d = new Date(date); filter.date = { $gte: d, $lt: new Date(d.getTime() + 86400000) }; }

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    HostelAttendance.find(filter).populate('student', 'name').populate('hostel', 'name').populate('room', 'roomNumber').sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    HostelAttendance.countDocuments(filter),
  ]);
  ok(res, { data: records, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const markHostelAttendance = asyncHandler(async (req, res) => {
  const { hostelId, studentId, date, status, notes } = req.body;
  if (!hostelId || !studentId || !date || !status) return err(res, 400, 'All fields required');
  const record = await HostelAttendance.findOneAndUpdate(
    { hostel: hostelId, student: studentId, date: new Date(date), ...tenantFilter(req) },
    { status, notes, recordedBy: req.user._id, checkInTime: status === 'present' ? new Date() : undefined },
    { upsert: true, new: true }
  );
  ok(res, { data: record });
});

// ── HOSTEL BED ALLOCATIONS ───────────────────────────────────────────────────

export const getBedAllocations = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { hostelId, roomId, studentId, status, page = 1, limit = 20 } = req.query;
  if (hostelId) filter.hostel = hostelId;
  if (roomId) filter.room = roomId;
  if (studentId) filter.student = studentId;
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [allocs, total] = await Promise.all([
    HostelBedAllocation.find(filter).populate('student', 'name').populate('hostel', 'name').populate('room', 'roomNumber').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    HostelBedAllocation.countDocuments(filter),
  ]);
  ok(res, { data: allocs, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createBedAllocation = asyncHandler(async (req, res) => {
  const { hostelId, roomId, studentId, startDate, bedNumber, monthlyFee } = req.body;
  if (!hostelId || !roomId || !studentId) return err(res, 400, 'Hostel, room, and student required');
  const existing = await HostelBedAllocation.findOne({ student: studentId, hostel: hostelId, status: 'active', ...tenantFilter(req) });
  if (existing) return err(res, 400, 'Student already has an active allocation');
  const alloc = await HostelBedAllocation.create({ ...tenantFilter(req), academicYear: req.academicYearId, hostel: hostelId, room: roomId, student: studentId, startDate, bedNumber, monthlyFee, allocatedBy: req.user._id });
  ok(res, { data: alloc }, 201);
});

export const updateBedAllocation = asyncHandler(async (req, res) => {
  const alloc = await HostelBedAllocation.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!alloc) return err(res, 404, 'Allocation not found');
  ok(res, { data: alloc });
});

export const deleteBedAllocation = asyncHandler(async (req, res) => {
  const alloc = await HostelBedAllocation.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true, status: 'inactive' }, { new: true });
  if (!alloc) return err(res, 404, 'Allocation not found');
  ok(res, { message: 'Allocation deleted' });
});

export const getHostelOccupancy = asyncHandler(async (req, res) => {
  const { hostelId } = req.query;
  const filter = { ...tenantFilter(req), isDeleted: false, status: 'active' };
  if (hostelId) filter.hostel = hostelId;
  const allocations = await HostelBedAllocation.find(filter).populate('hostel', 'name').populate('room', 'roomNumber capacity').lean();
  const byHostel = {};
  for (const a of allocations) {
    const hId = a.hostel?._id?.toString() || 'unknown';
    if (!byHostel[hId]) byHostel[hId] = { hostel: a.hostel, total: 0, occupied: 0, rooms: {} };
    byHostel[hId].occupied++;
    const rId = a.room?._id?.toString() || 'unknown';
    if (!byHostel[hId].rooms[rId]) byHostel[hId].rooms[rId] = { room: a.room, capacity: a.room?.capacity || 0, occupied: 0 };
    byHostel[hId].rooms[rId].occupied++;
  }
  ok(res, { data: Object.values(byHostel) });
});
