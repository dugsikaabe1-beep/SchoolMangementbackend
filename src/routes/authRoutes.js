import express from 'express';
import {
  login,
  register,
  getProfile,
  resetPassword,
  studentLogin,
  teacherLogin,
  adminLogin,
  getTenantInfo,
  refreshAccessToken,
  logout,
} from '../controllers/authController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';
import {
  validate,
  adminLoginBodySchema,
  credLoginSchema,
  schoolScopedLoginSchema,
} from '../middlewares/validationMiddleware.js';

const router = express.Router();

router.get('/tenant', getTenantInfo);

router.post('/refresh', refreshAccessToken);
router.post('/logout', protect, logout);

router.post('/login', validate(schoolScopedLoginSchema), login);
router.post('/student-login', validate(credLoginSchema), studentLogin);
router.post('/teacher-login', validate(credLoginSchema), teacherLogin);
router.post('/admin-login', validate(adminLoginBodySchema), adminLogin);

router.post(
  '/register',
  protect,
  authorize('admin', 'schooladmin', 'school_admin'),
  register
);
router.get('/profile', protect, getProfile);
router.put('/reset-password', protect, resetPassword);

export default router;

