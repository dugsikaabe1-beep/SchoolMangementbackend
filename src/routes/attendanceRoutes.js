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
import { injectAcademicYear } from '../utils/academicUtils.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const router = express.Router();

router.use(asyncHandler(protect));
router.use(asyncHandler(injectAcademicYear));

router.post('/qr/generate', generateAttendanceQR);
router.post('/qr/verify', verifyQRAttendance);
router.post('/qr/check-out/:attendanceId', checkOutQR);
router.post('/qr/revoke', revokeQR);
router.get('/qr/history', getQRAttendanceHistory);
router.get('/qr/daily-report', getQRDailyReport);
router.get('/qr/monthly-report', getQRMonthlyReport);
router.post('/qr/personal', generatePersonalQR);
router.post('/qr/personal/verify', verifyPersonalQR);
router.post('/qr/bulk', bulkQRAttendance);

router.post('/rfid/register', registerRFIDTag);
router.post('/rfid/verify', verifyRFIDAttendance);
router.get('/rfid/status/:userId', getRFIDRegistrationStatus);
router.delete('/rfid/unregister/:userId', unregisterRFIDTag);
router.post('/rfid/replace', replaceRFIDCard);
router.patch('/rfid/deactivate/:userId', deactivateRFIDCard);
router.patch('/rfid/activate/:userId', activateRFIDCard);

router.post('/nfc/register', registerNFCId);
router.post('/nfc/verify', verifyNFCAttendance);
router.get('/nfc/status/:userId', getNFCRegistrationStatus);
router.delete('/nfc/unregister/:userId', unregisterNFCId);
router.put('/nfc/replace', replaceNFCCard);
router.put('/nfc/deactivate/:userId', deactivateNFCCard);
router.put('/nfc/activate/:userId', activateNFCCard);

router.post('/face/register', registerFaceData);
router.post('/face/verify', verifyFaceAttendance);
router.get('/face/status/:userId', getFaceRegistrationStatus);
router.delete('/face/unregister/:userId', unregisterFaceData);
router.put('/face/replace', replaceFaceData);
router.put('/face/deactivate/:userId', deactivateFaceData);
router.put('/face/activate/:userId', activateFaceData);

router.post('/fingerprint/register', registerFingerprintTemplate);
router.post('/fingerprint/verify', verifyFingerprintAttendance);
router.get('/fingerprint/status/:userId', getFingerprintRegistrationStatus);
router.delete('/fingerprint/unregister/:userId/:fingerIndex?', unregisterFingerprintTemplate);
router.put('/fingerprint/replace', replaceFingerprint);
router.put('/fingerprint/deactivate/:userId', deactivateFingerprint);
router.put('/fingerprint/activate/:userId', activateFingerprint);

router.get('/stats/methods', getAttendanceMethodStats);
router.get('/by-method', getAttendanceByMethod);
router.get('/export', exportAttendance);

export default router;
