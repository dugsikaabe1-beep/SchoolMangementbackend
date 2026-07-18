import AttendanceDevice from '../models/AttendanceDevice.js';
import crypto from 'crypto';
import asyncHandler from '../middlewares/asyncHandler.js';
import { logAction } from '../utils/auditLog.js';

const generateApiKey = () => `att_${crypto.randomBytes(24).toString('hex')}`;
const generateSecret = () => crypto.randomBytes(32).toString('hex');

export const getDevices = asyncHandler(async (req, res) => {
  const { status, deviceType, branchId } = req.query;
  const filter = { school: req.schoolId, isDeleted: false };
  if (status) filter.status = status;
  if (deviceType) filter.deviceType = deviceType;
  if (branchId) filter.branch = branchId;

  const devices = await AttendanceDevice.find(filter)
    .populate('branch', 'name')
    .sort({ createdAt: -1 });

  const stats = await AttendanceDevice.aggregate([
    { $match: { school: req.schoolId, isDeleted: false } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  res.json({ success: true, data: devices, stats });
});

export const getDevice = asyncHandler(async (req, res) => {
  const device = await AttendanceDevice.findOne({
    _id: req.params.id,
    school: req.schoolId,
    isDeleted: false,
  }).populate('branch', 'name');

  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
  res.json({ success: true, data: device });
});

export const registerDevice = asyncHandler(async (req, res) => {
  const { name, deviceType, serialNumber, branchId, campus, location, firmware, capabilities, settings } = req.body;
  if (!name || !deviceType || !serialNumber) {
    return res.status(400).json({ success: false, message: 'name, deviceType, and serialNumber are required' });
  }

  const existing = await AttendanceDevice.findOne({ school: req.schoolId, serialNumber, isDeleted: false });
  if (existing) {
    return res.status(400).json({ success: false, message: 'A device with this serial number already exists' });
  }

  const apiKey = generateApiKey();
  const secret = generateSecret();

  const device = await AttendanceDevice.create({
    name, deviceType, serialNumber,
    apiKey, secret,
    school: req.schoolId,
    branch: branchId || undefined,
    campus, location,
    firmware: firmware || '1.0.0',
    capabilities: capabilities || [deviceType],
    settings: { ...settings },
    status: 'offline',
  });

  await logAction(req, {
    action: 'DEVICE_REGISTERED',
    module: 'ATTENDANCE',
    targetId: device._id,
    details: { name, deviceType, serialNumber },
  });

  res.status(201).json({ success: true, data: device, message: 'Device registered. Store the API key and secret securely.' });
});

export const updateDevice = asyncHandler(async (req, res) => {
  const device = await AttendanceDevice.findOne({
    _id: req.params.id,
    school: req.schoolId,
    isDeleted: false,
  });
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

  const allowed = ['name', 'branch', 'campus', 'location', 'firmware', 'status', 'settings', 'capabilities'];
  allowed.forEach(f => { if (req.body[f] !== undefined) device[f] = req.body[f]; });
  await device.save();

  res.json({ success: true, data: device });
});

export const deleteDevice = asyncHandler(async (req, res) => {
  const device = await AttendanceDevice.findOne({
    _id: req.params.id,
    school: req.schoolId,
    isDeleted: false,
  });
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

  device.isDeleted = true;
  device.deletedAt = new Date();
  device.deletedBy = req.userId;
  device.status = 'decommissioned';
  await device.save();

  res.json({ success: true, message: 'Device decommissioned' });
});

export const regenerateCredentials = asyncHandler(async (req, res) => {
  const device = await AttendanceDevice.findOne({
    _id: req.params.id,
    school: req.schoolId,
    isDeleted: false,
  });
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

  device.apiKey = generateApiKey();
  device.secret = generateSecret();
  await device.save();

  await logAction(req, {
    action: 'DEVICE_CREDENTIALS_REGENERATED',
    module: 'ATTENDANCE',
    targetId: device._id,
    details: { name: device.name },
  });

  res.json({ success: true, data: { apiKey: device.apiKey, secret: device.secret }, message: 'Credentials regenerated. Store them securely.' });
});

export const deviceHeartbeat = asyncHandler(async (req, res) => {
  const { apiKey } = req.headers;
  if (!apiKey) return res.status(401).json({ success: false, message: 'API key required' });

  const device = await AttendanceDevice.findOne({ apiKey, isDeleted: false });
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

  device.status = 'online';
  device.lastOnline = new Date();
  device.ipAddress = req.ip || req.headers['x-forwarded-for'] || undefined;
  if (req.body.health) device.health = { ...device.health, ...req.body.health, lastHeartbeat: new Date() };
  await device.save();

  res.json({ success: true, data: { status: 'ok', serverTime: new Date() } });
});

export const getDeviceStats = asyncHandler(async (req, res) => {
  const stats = await AttendanceDevice.aggregate([
    { $match: { school: req.schoolId, isDeleted: false } },
    {
      $group: {
        _id: { status: '$status', type: '$deviceType' },
        count: { $sum: 1 },
      },
    },
  ]);

  const total = await AttendanceDevice.countDocuments({ school: req.schoolId, isDeleted: false });
  const online = await AttendanceDevice.countDocuments({ school: req.schoolId, isDeleted: false, status: 'online' });

  res.json({ success: true, data: { total, online, offline: total - online, breakdown: stats } });
});
