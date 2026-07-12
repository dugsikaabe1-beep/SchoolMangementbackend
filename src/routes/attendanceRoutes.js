import express from 'express';
import {
  generateAttendanceQR,
  verifyQRAttendance,
  getAttendanceMethodStats,
  getAttendanceByMethod,
  bulkQRAttendance,
  registerRFIDTag,
  verifyRFIDAttendance,
  getRFIDRegistrationStatus,
  unregisterRFIDTag,
  registerNFCId,
  verifyNFCAttendance,
  getNFCRegistrationStatus,
  unregisterNFCId,
  registerFaceData,
  verifyFaceAttendance,
  getFaceRegistrationStatus,
  unregisterFaceData,
  registerFingerprintTemplate,
  verifyFingerprintAttendance,
  getFingerprintRegistrationStatus,
  unregisterFingerprintTemplate
} from '../controllers/attendanceController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const router = express.Router();

// QR Attendance Routes
router.post('/qr/generate', protect, asyncHandler(generateAttendanceQR));
router.post('/qr/verify', protect, asyncHandler(verifyQRAttendance));
router.post('/qr/bulk', protect, asyncHandler(bulkQRAttendance));

// RFID Attendance Routes
router.post('/rfid/register', protect, asyncHandler(registerRFIDTag));
router.post('/rfid/verify', protect, asyncHandler(verifyRFIDAttendance));
router.get('/rfid/status/:studentId', protect, asyncHandler(getRFIDRegistrationStatus));
router.delete('/rfid/unregister/:studentId', protect, asyncHandler(unregisterRFIDTag));

// NFC Attendance Routes
router.post('/nfc/register', protect, asyncHandler(registerNFCId));
router.post('/nfc/verify', protect, asyncHandler(verifyNFCAttendance));
router.get('/nfc/status/:studentId', protect, asyncHandler(getNFCRegistrationStatus));
router.delete('/nfc/unregister/:studentId', protect, asyncHandler(unregisterNFCId));

// Face Recognition Attendance Routes
router.post('/face/register', protect, asyncHandler(registerFaceData));
router.post('/face/verify', protect, asyncHandler(verifyFaceAttendance));
router.get('/face/status/:studentId', protect, asyncHandler(getFaceRegistrationStatus));
router.delete('/face/unregister/:studentId', protect, asyncHandler(unregisterFaceData));

// Fingerprint Attendance Routes
router.post('/fingerprint/register', protect, asyncHandler(registerFingerprintTemplate));
router.post('/fingerprint/verify', protect, asyncHandler(verifyFingerprintAttendance));
router.get('/fingerprint/status/:studentId', protect, asyncHandler(getFingerprintRegistrationStatus));
router.delete('/fingerprint/unregister/:studentId', protect, asyncHandler(unregisterFingerprintTemplate));

// Attendance Analytics
router.get('/stats/methods', protect, asyncHandler(getAttendanceMethodStats));
router.get('/by-method', protect, asyncHandler(getAttendanceByMethod));

export default router;
