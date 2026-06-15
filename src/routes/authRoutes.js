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
} from '../controllers/authController.js';
import { protect, authorizeRoles } from '../middlewares/authMiddleware.js';
import {
  validate,
  adminLoginBodySchema,
  credLoginSchema,
  schoolScopedLoginSchema,
} from '../middlewares/validationMiddleware.js';
import { rateLimitResendVerification } from '../middlewares/rateLimiter.js';

const router = express.Router();

router.get('/tenant', getTenantInfo);

router.post('/refresh', refreshAccessToken);
router.post('/logout', protect, logout);

router.post('/verify-2fa', verify2FA);
router.post('/resend-2fa', resend2FA);

router.post('/verify-email', verifyEmail);
router.post('/resend-verification', rateLimitResendVerification, resendVerification);

router.post('/test-email', testEmail);

router.post('/login', validate(schoolScopedLoginSchema), login);
router.post('/student-login', validate(credLoginSchema), studentLogin);
router.post('/teacher-login', validate(credLoginSchema), teacherLogin);
router.post('/parent-login', validate(credLoginSchema), parentLogin);
router.post('/admin-login', validate(adminLoginBodySchema), adminLogin);
router.post('/branch-login', validate(adminLoginBodySchema), branchLogin);

router.post(
  '/register',
  protect,
  authorizeRoles('admin', 'schooladmin', 'school_admin'),
  register
);
router.get('/profile', protect, getProfile);
router.put('/preferences', protect, updatePreferences);
router.put('/reset-password', protect, resetPassword);

export default router;
