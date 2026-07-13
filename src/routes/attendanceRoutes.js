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
  getAttendanceMethodStats,
  getAttendanceByMethod,
  exportAttendance,
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

const router = express.Router();

router.post('/qr/generate', protect, generateAttendanceQR);
router.post('/qr/verify', protect, verifyQRAttendance);
router.post('/qr/check-out/:attendanceId', protect, checkOutQR);
router.post('/qr/revoke', protect, revokeQR);
router.get('/qr/history', protect, getQRAttendanceHistory);
router.get('/qr/daily-report', protect, getQRDailyReport);
router.get('/qr/monthly-report', protect, getQRMonthlyReport);
router.post('/qr/personal', protect, generatePersonalQR);
router.post('/qr/personal/verify', protect, verifyPersonalQR);
router.post('/qr/bulk', protect, bulkQRAttendance);

router.post('/rfid/register', protect, registerRFIDTag);
router.post('/rfid/verify', protect, verifyRFIDAttendance);
router.get('/rfid/status/:userId', protect, getRFIDRegistrationStatus);
router.delete('/rfid/unregister/:userId', protect, unregisterRFIDTag);
router.post('/rfid/replace', protect, replaceRFIDCard);
router.patch('/rfid/deactivate/:userId', protect, deactivateRFIDCard);
router.patch('/rfid/activate/:userId', protect, activateRFIDCard);

router.post('/nfc/register', protect, registerNFCId);
router.post('/nfc/verify', protect, verifyNFCAttendance);
router.get('/nfc/status/:userId', protect, getNFCRegistrationStatus);
router.delete('/nfc/unregister/:userId', protect, unregisterNFCId);
router.put('/nfc/replace', protect, replaceNFCCard);
router.put('/nfc/deactivate/:userId', protect, deactivateNFCCard);
router.put('/nfc/activate/:userId', protect, activateNFCCard);

router.post('/face/register', protect, registerFaceData);
router.post('/face/verify', protect, verifyFaceAttendance);
router.get('/face/status/:userId', protect, getFaceRegistrationStatus);
router.delete('/face/unregister/:userId', protect, unregisterFaceData);
router.put('/face/replace', protect, replaceFaceData);
router.put('/face/deactivate/:userId', protect, deactivateFaceData);
router.put('/face/activate/:userId', protect, activateFaceData);

router.post('/fingerprint/register', protect, registerFingerprintTemplate);
router.post('/fingerprint/verify', protect, verifyFingerprintAttendance);
router.get('/fingerprint/status/:userId', protect, getFingerprintRegistrationStatus);
router.delete('/fingerprint/unregister/:userId/:fingerIndex?', protect, unregisterFingerprintTemplate);
router.put('/fingerprint/replace', protect, replaceFingerprint);
router.put('/fingerprint/deactivate/:userId', protect, deactivateFingerprint);
router.put('/fingerprint/activate/:userId', protect, activateFingerprint);

router.get('/stats/methods', protect, getAttendanceMethodStats);
router.get('/by-method', protect, getAttendanceByMethod);
router.get('/export', protect, exportAttendance);

export default router;
