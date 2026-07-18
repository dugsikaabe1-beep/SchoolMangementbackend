import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import {
  listRegistrations,
  getRegistration,
  createOrUpdateRegistration,
  unregisterMethod,
  getRegistrationStats,
  getAttendanceDashboard,
  getLiveAttendanceFeed,
  getAttendanceLogs,
  getAttendanceReport,
  getLateAnalytics,
  getPayrollAttendance,
  listRules,
  createRule,
  updateRule,
  deleteRule,
  triggerSync,
  startDeviceEngine,
  stopDeviceEngine,
  searchStaff,
} from '../controllers/attendanceRegistrationController.js';

import {
  listDevices,
  getDevice,
  addDevice,
  updateDevice,
  deleteDevice,
  connectDevice,
  disconnectDevice,
  getDeviceHealth,
  syncDeviceLogs,
  getDeviceLogs,
  getDeviceHealthOverview,
} from '../controllers/biometricDeviceController.js';

const router = express.Router();

router.use(asyncHandler(protect));
router.use(asyncHandler(injectAcademicYear));

// ── Attendance Registrations ──────────────────────────────────────
router.get('/registrations', listRegistrations);
router.get('/registrations/stats', getRegistrationStats);
router.get('/registrations/:employeeId', getRegistration);
router.post('/registrations', createOrUpdateRegistration);
router.delete('/registrations/:employeeId/:method', unregisterMethod);

// ── Staff Search (for registration page) ──────────────────────────
router.get('/staff/search', searchStaff);

// ── Dashboard ─────────────────────────────────────────────────────
router.get('/dashboard', getAttendanceDashboard);
router.get('/live', getLiveAttendanceFeed);

// ── Attendance Logs ───────────────────────────────────────────────
router.get('/logs', getAttendanceLogs);

// ── Reports ───────────────────────────────────────────────────────
router.get('/reports', getAttendanceReport);
router.get('/reports/late', getLateAnalytics);
router.get('/reports/payroll', getPayrollAttendance);

// ── Attendance Rules ──────────────────────────────────────────────
router.get('/rules', listRules);
router.post('/rules', createRule);
router.put('/rules/:ruleId', updateRule);
router.delete('/rules/:ruleId', deleteRule);

// ── Device Management ─────────────────────────────────────────────
router.get('/devices', listDevices);
router.get('/devices/health', getDeviceHealthOverview);
router.get('/devices/logs', getDeviceLogs);
router.get('/devices/:deviceId', getDevice);
router.post('/devices', addDevice);
router.put('/devices/:deviceId', updateDevice);
router.delete('/devices/:deviceId', deleteDevice);
router.post('/devices/:deviceId/connect', connectDevice);
router.post('/devices/:deviceId/disconnect', disconnectDevice);
router.get('/devices/:deviceId/health', getDeviceHealth);
router.post('/devices/:deviceId/sync', syncDeviceLogs);

// ── Engine Control ────────────────────────────────────────────────
router.post('/engine/start', startDeviceEngine);
router.post('/engine/stop', stopDeviceEngine);

export default router;
