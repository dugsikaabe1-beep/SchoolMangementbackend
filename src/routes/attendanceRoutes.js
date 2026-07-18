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
  getAttendanceByMethod,
  exportAttendance,
  getModuleAttendanceReport,
  validateGeofence,
  getStaffAttendanceAnalytics,
  getTodayStaffAttendance,
  registerRFIDTag,
  verifyRFIDAttendance,
  getRFIDRegistrationStatus,
  unregisterRFIDTag,
  replaceRFIDCard,
  deactivateRFIDCard,
  activateRFIDCard,
  registerNFCId,
  verifyNFCAttendance,
  getNFCRegistrationStatus,
  unregisterNFCId,
  replaceNFCCard,
  deactivateNFCCard,
  activateNFCCard,
  registerFaceData,
  verifyFaceAttendance,
  getFaceRegistrationStatus,
  unregisterFaceData,
  replaceFaceData,
  deactivateFaceData,
  activateFaceData,
  registerFingerprintTemplate,
  verifyFingerprintAttendance,
  getFingerprintRegistrationStatus,
  unregisterFingerprintTemplate,
  replaceFingerprint,
  deactivateFingerprint,
  activateFingerprint
} from '../controllers/attendanceController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import attendanceMethodGuard from '../middlewares/attendanceMethodGuard.js';

const router = express.Router();

router.use(asyncHandler(protect));
router.use(asyncHandler(injectAcademicYear));

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

router.post('/rfid/register', attendanceMethodGuard('RFID'), registerRFIDTag);
router.post('/rfid/verify', attendanceMethodGuard('RFID'), verifyRFIDAttendance);
router.get('/rfid/status/:userId', getRFIDRegistrationStatus);
router.delete('/rfid/unregister/:userId', unregisterRFIDTag);
router.post('/rfid/replace', attendanceMethodGuard('RFID'), replaceRFIDCard);
router.patch('/rfid/deactivate/:userId', deactivateRFIDCard);
router.patch('/rfid/activate/:userId', activateRFIDCard);

router.post('/nfc/register', attendanceMethodGuard('NFC'), registerNFCId);
router.post('/nfc/verify', attendanceMethodGuard('NFC'), verifyNFCAttendance);
router.get('/nfc/status/:userId', getNFCRegistrationStatus);
router.delete('/nfc/unregister/:userId', unregisterNFCId);
router.put('/nfc/replace', attendanceMethodGuard('NFC'), replaceNFCCard);
router.put('/nfc/deactivate/:userId', deactivateNFCCard);
router.put('/nfc/activate/:userId', activateNFCCard);

router.post('/face/register', attendanceMethodGuard('FACE_RECOGNITION'), registerFaceData);
router.post('/face/verify', attendanceMethodGuard('FACE_RECOGNITION'), verifyFaceAttendance);
router.get('/face/status/:userId', getFaceRegistrationStatus);
router.delete('/face/unregister/:userId', unregisterFaceData);
router.put('/face/replace', attendanceMethodGuard('FACE_RECOGNITION'), replaceFaceData);
router.put('/face/deactivate/:userId', deactivateFaceData);
router.put('/face/activate/:userId', activateFaceData);

router.post('/fingerprint/register', attendanceMethodGuard('FINGERPRINT'), registerFingerprintTemplate);
router.post('/fingerprint/verify', attendanceMethodGuard('FINGERPRINT'), verifyFingerprintAttendance);
router.get('/fingerprint/status/:userId', getFingerprintRegistrationStatus);
router.delete('/fingerprint/unregister/:userId/:fingerIndex?', unregisterFingerprintTemplate);
router.put('/fingerprint/replace', attendanceMethodGuard('FINGERPRINT'), replaceFingerprint);
router.put('/fingerprint/deactivate/:userId', deactivateFingerprint);
router.put('/fingerprint/activate/:userId', activateFingerprint);

router.get('/stats/methods', getAttendanceMethodStats);
router.get('/by-method', getAttendanceByMethod);
router.get('/export', exportAttendance);
router.get('/module-report', getModuleAttendanceReport);
router.post('/geofence/validate', validateGeofence);
router.get('/staff/analytics', getStaffAttendanceAnalytics);
router.get('/staff/today', getTodayStaffAttendance);

export default router;
