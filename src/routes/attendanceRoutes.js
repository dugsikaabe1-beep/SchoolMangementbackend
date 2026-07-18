import express from 'express';
import {
  generateAttendanceQR,
  verifyQRAttendance,
  checkOutQR,
  revokeQR,
  getQRAttendanceHistory,
  getQRDailyReport,
  getQRMonthlyReport,
  generatePersonalQR,
  verifyPersonalQR,
  bulkQRAttendance,
  getActiveQR,
  getAttendanceMethodStats,
  exportAttendance,
  getModuleAttendanceReport,
  validateGeofence,
} from '../controllers/attendanceController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import attendanceMethodGuard from '../middlewares/attendanceMethodGuard.js';

const router = express.Router();

router.use(asyncHandler(protect));
router.use(asyncHandler(injectAcademicYear));

// ── Student QR Attendance (STAFF BIOMETRIC IS NOW ON biometricAttendanceRoutes) ──
router.post('/qr/generate', generateAttendanceQR);
router.get('/qr/active', getActiveQR);
router.post('/qr/verify', attendanceMethodGuard('QR'), verifyQRAttendance);
router.post('/qr/check-out/:attendanceId', attendanceMethodGuard('QR'), checkOutQR);
router.post('/qr/revoke', revokeQR);
router.get('/qr/history', getQRAttendanceHistory);
router.get('/qr/daily-report', getQRDailyReport);
router.get('/qr/monthly-report', getQRMonthlyReport);
router.post('/qr/personal', generatePersonalQR);
router.post('/qr/personal/verify', attendanceMethodGuard('QR'), verifyPersonalQR);
router.post('/qr/bulk', attendanceMethodGuard('QR'), bulkQRAttendance);

// ── Shared Utility Routes ─────────────────────────────────────────
router.get('/stats/methods', getAttendanceMethodStats);
router.get('/export', exportAttendance);
router.get('/module-report', getModuleAttendanceReport);
router.post('/geofence/validate', validateGeofence);

export default router;
