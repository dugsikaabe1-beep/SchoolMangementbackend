import express from 'express';
import {
  login,
  register,
  getProfile,
  updatePreferences,
  resetPassword,
  studentLogin,
  teacherLogin,
  parentLogin,
  adminLogin,
  branchLogin,
  getTenantInfo,
  refreshAccessToken,
  logout,
  verify2FA,
  resend2FA,
  verifyEmail,
  resendVerification,
  testEmail,
  registerDevice,
  unregisterDevice,
  setupMFA,
  enableMFA,
  disableMFA,
  verifyMFA,
  getMFAStatus,
} from '../controllers/authController.js';
import { protect, authorizeRoles } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import {
  validate,
  adminLoginBodySchema,
  credLoginSchema,
  schoolScopedLoginSchema,
} from '../middlewares/validationMiddleware.js';
import { rateLimitResendVerification } from '../middlewares/rateLimiter.js';

const router = express.Router();

router.get('/tenant', asyncHandler(getTenantInfo));

router.post('/refresh', asyncHandler(refreshAccessToken));
router.post('/logout', protect, asyncHandler(logout));

router.post('/verify-2fa', asyncHandler(verify2FA));
router.post('/resend-2fa', asyncHandler(resend2FA));

router.post('/verify-email', asyncHandler(verifyEmail));
router.post('/resend-verification', rateLimitResendVerification, asyncHandler(resendVerification));

router.post('/test-email', asyncHandler(testEmail));

router.post('/login', validate(schoolScopedLoginSchema), asyncHandler(login));
router.post('/student-login', validate(credLoginSchema), asyncHandler(studentLogin));
router.post('/teacher-login', validate(credLoginSchema), asyncHandler(teacherLogin));
router.post('/parent-login', validate(credLoginSchema), asyncHandler(parentLogin));
router.post('/admin-login', validate(adminLoginBodySchema), asyncHandler(adminLogin));
router.post('/branch-login', validate(adminLoginBodySchema), asyncHandler(branchLogin));

router.post(
  '/register',
  protect,
  authorizeRoles('admin', 'schooladmin', 'school_admin'),
  asyncHandler(register)
);
router.get('/profile', protect, asyncHandler(getProfile));
router.put('/preferences', protect, asyncHandler(updatePreferences));
router.put('/reset-password', protect, asyncHandler(resetPassword));

// Device registration for push notifications
router.post('/profile/device', protect, asyncHandler(registerDevice));
router.delete('/profile/device', protect, asyncHandler(unregisterDevice));

// MFA Routes
router.post('/mfa/setup', protect, asyncHandler(setupMFA));
router.post('/mfa/enable', protect, asyncHandler(enableMFA));
router.post('/mfa/disable', protect, asyncHandler(disableMFA));
router.post('/mfa/verify', asyncHandler(verifyMFA));
router.get('/mfa/status', protect, asyncHandler(getMFAStatus));

export default router;
