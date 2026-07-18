/**
 * attendanceMethodGuard — Middleware that checks if a specific attendance
 * method (QR, RFID, NFC, FACE, FINGERPRINT) is enabled for the school.
 *
 * Usage in routes:
 *   router.post('/rfid/verify', protect, attendanceMethodGuard('RFID'), verifyRFIDAttendance);
 *   router.post('/face/verify', protect, attendanceMethodGuard('FACE'), verifyFaceAttendance);
 */
import { isFeatureEnabled } from '../utils/featureAccess.js';
import { asyncHandler } from './asyncHandler.js';

const METHOD_FEATURE_MAP = {
  MANUAL:              'attendance',
  QR:                  'attendance-qr',
  RFID:                'attendance-rfid',
  NFC:                 'attendance-nfc',
  FACE_RECOGNITION:    'attendance-face',
  FINGERPRINT:         'attendance-fingerprint',
};

/**
 * Returns middleware that verifies the given attendance method is in the
 * school's plan features.
 *
 * @param {string} method — One of: QR, RFID, NFC, FACE_RECOGNITION, FINGERPRINT, MANUAL
 */
const attendanceMethodGuard = (method) => {
  const featureCode = METHOD_FEATURE_MAP[method];
  if (!featureCode) {
    throw new Error(`Unknown attendance method: ${method}`);
  }

  return asyncHandler(async (req, res, next) => {
    const schoolId = req.user?.school;
    if (!schoolId) return next(); // superadmin bypass

    const enabled = await isFeatureEnabled(schoolId, featureCode);
    if (!enabled) {
      return res.status(403).json({
        success: false,
        message: `${method} attendance is not enabled for your subscription plan. Please upgrade your plan.`,
        userMessage: `${method} attendance is not enabled for your subscription plan. Please upgrade your plan.`
      });
    }

    next();
  });
};

export default attendanceMethodGuard;
export { METHOD_FEATURE_MAP };
