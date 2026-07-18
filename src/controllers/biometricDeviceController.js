import asyncHandler from 'express-async-handler';
import BiometricDevice from '../models/BiometricDevice.js';
import BiometricDeviceLog from '../models/BiometricDeviceLog.js';
import zktecoSync from '../services/attendance/ZKTecoSyncService.js';
import { logAction } from '../utils/auditLogger.js';
import { emitAttendanceEvent } from '../utils/socket.js';

// ═══════════════════════════════════════════════════════════════════
// DEVICE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

export const listDevices = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { branch, status, model, page = 1, limit = 20 } = req.query;

  const filter = { school: schoolId, isDeleted: false };
  if (branch) filter.branch = branch;
  if (status) filter.healthStatus = status;
  if (model) filter.model = model;

  const skip = (Number(page) - 1) * Number(limit);
  const [devices, total] = await Promise.all([
    BiometricDevice.find(filter)
      .populate('branch', 'name')
      .populate('addedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    BiometricDevice.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: devices,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

export const getDevice = asyncHandler(async (req, res) => {
  const device = await BiometricDevice.findOne({ _id: req.params.deviceId, isDeleted: false })
    .populate('branch', 'name')
    .populate('addedBy', 'firstName lastName')
    .lean();
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
  res.json({ success: true, data: device });
});

export const addDevice = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { name, serialNo, model, ip, port, branch, capabilities, pushKey, protocol } = req.body;

  if (!name || !serialNo || !model || !ip) {
    return res.status(400).json({ success: false, message: 'name, serialNo, model, and ip are required' });
  }

  const existing = await BiometricDevice.findOne({ serialNo });
  if (existing) {
    return res.status(409).json({ success: false, message: 'Device with this serial number already exists' });
  }

  // Auto-detect capabilities from model
  const defaultCapabilities = _getCapabilitiesForModel(model);

  const device = await BiometricDevice.create({
    name, serialNo, model, ip, port: port || 4370,
    school: schoolId, branch,
    capabilities: { ...defaultCapabilities, ...capabilities },
    pushKey: pushKey || 'push',
    protocol: protocol || 'TCP',
    addedBy: req.user._id,
  });

  await logAction({ action: 'DEVICE_ADDED', user: req.user._id, school: schoolId, meta: { deviceId: device._id, model, serialNo } });

  res.status(201).json({ success: true, data: device, message: `Device "${name}" added successfully` });
});

export const updateDevice = asyncHandler(async (req, res) => {
  const device = await BiometricDevice.findOneAndUpdate(
    { _id: req.params.deviceId, isDeleted: false },
    req.body,
    { new: true, runValidators: true }
  );
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
  res.json({ success: true, data: device });
});

export const deleteDevice = asyncHandler(async (req, res) => {
  const device = await BiometricDevice.findByIdAndUpdate(
    req.params.deviceId,
    { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id },
    { new: true }
  );
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

  // Disconnect from device
  try { await zktecoSync.disconnectDevice(req.params.deviceId); } catch {}

  res.json({ success: true, message: 'Device removed' });
});

// ═══════════════════════════════════════════════════════════════════
// DEVICE OPERATIONS
// ═══════════════════════════════════════════════════════════════════

export const connectDevice = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  await zktecoSync.connectToDevice(deviceId);
  await BiometricDevice.findByIdAndUpdate(deviceId, { healthStatus: 'ONLINE', lastSeen: new Date() });

  emitAttendanceEvent(req.user.school, 'attendance:device-status', {
    device: deviceId, status: 'ONLINE',
  });

  res.json({ success: true, message: 'Device connected' });
});

export const disconnectDevice = asyncHandler(async (req, res) => {
  await zktecoSync.disconnectDevice(req.params.deviceId);
  await BiometricDevice.findByIdAndUpdate(req.params.deviceId, { healthStatus: 'OFFLINE' });

  res.json({ success: true, message: 'Device disconnected' });
});

export const getDeviceHealth = asyncHandler(async (req, res) => {
  const health = await zktecoSync.getDeviceHealth(req.params.deviceId);
  res.json({ success: true, data: health });
});

export const syncDeviceLogs = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { since } = req.query;
  const logs = await zktecoSync.pullAttendanceLogs(deviceId, since ? new Date(since) : undefined);
  res.json({ success: true, data: { synced: logs.length } });
});

export const getDeviceLogs = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { device, type, page = 1, limit = 50 } = req.query;

  const filter = { school: schoolId };
  if (device) filter.device = device;
  if (type) filter.type = type;

  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    BiometricDeviceLog.find(filter)
      .populate('device', 'name model serialNo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    BiometricDeviceLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// ═══════════════════════════════════════════════════════════════════
// DEVICE HEALTH MONITORING
// ═══════════════════════════════════════════════════════════════════

export const getDeviceHealthOverview = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;

  const devices = await BiometricDevice.find({ school: schoolId, isDeleted: false })
    .select('name model serialNo ip healthStatus lastSeen attendanceEnabled')
    .lean();

  const overview = {
    total: devices.length,
    online: devices.filter(d => d.healthStatus === 'ONLINE').length,
    offline: devices.filter(d => d.healthStatus === 'OFFLINE').length,
    degraded: devices.filter(d => d.healthStatus === 'DEGRADED').length,
    maintenance: devices.filter(d => d.healthStatus === 'MAINTENANCE').length,
    unknown: devices.filter(d => d.healthStatus === 'UNKNOWN').length,
    devices,
  };

  res.json({ success: true, data: overview });
});

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function _getCapabilitiesForModel(model) {
  const m = model.toLowerCase();
  if (m.includes('speedface') || m.includes('v5l') || m.includes('h5l')) {
    return { face: true, fingerprint: true, rfid: true, nfc: true, password: true };
  }
  if (m.includes('mb360') || m.includes('mb20')) {
    return { face: true, fingerprint: true, rfid: true, nfc: false, password: true };
  }
  if (m.includes('k20')) {
    return { face: true, fingerprint: true, rfid: true, nfc: false, password: true };
  }
  if (m.includes('k14')) {
    return { face: false, fingerprint: true, rfid: true, nfc: false, password: true };
  }
  return { face: false, fingerprint: false, rfid: true, nfc: false, password: true };
}
