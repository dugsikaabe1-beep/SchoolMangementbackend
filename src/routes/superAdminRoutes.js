import express from 'express';
import {
  superAdminLogin,
  registerSuperAdmin,
  checkSuperAdminExists,
  getAllSchools,
  getSchoolById,
  updateSchool,
  updateSchoolSubscription,
  toggleSchoolBlock,
  deleteSchool,
  getDashboardStats,
  extendSubscription,
  createSchoolAdmin,
  getAllSchoolAdmins,
  getSchoolAdminById,
  updateSchoolAdmin,
  resetSchoolAdminPassword,
  toggleSchoolAdminStatus,
  deleteSchoolAdmin
} from '../controllers/superAdminController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { blockTenantContextForSuperAdminAuth } from '../middlewares/tenantMiddleware.js';

const router = express.Router();

// Public routes — must not run under a school tenant host
router.get('/check-exists', blockTenantContextForSuperAdminAuth, checkSuperAdminExists);
router.post('/register', blockTenantContextForSuperAdminAuth, registerSuperAdmin);
router.post('/login', blockTenantContextForSuperAdminAuth, superAdminLogin);

// Protected routes (Super Admin only)
router.use(protect);

// Middleware to ensure only Super Admin can access
router.use((req, res, next) => {
  const role = req.user?.role;
  if (role !== 'superadmin' && role !== 'super_admin' && !req.user?.isSuperAdmin) {
    return res.status(403).json({
      message: 'Access denied',
      userMessage: 'You do not have permission to access this resource.',
    });
  }
  next();
});

// Dashboard
router.get('/dashboard/stats', getDashboardStats);

// Schools Management
router.get('/schools', getAllSchools);
router.get('/schools/:id', getSchoolById);
router.put('/schools/:id', updateSchool);
router.delete('/schools/:id', deleteSchool);

// Subscription Management
router.put('/schools/:id/subscription', updateSchoolSubscription);
router.post('/schools/:id/extend', extendSubscription);

// Block/Unblock
router.post('/schools/:id/toggle-block', toggleSchoolBlock);

// Create School Admin (simplified - Super Admin only provides email & password)
router.post('/schools/:id/admins', createSchoolAdmin);

// Alternative endpoint for creating school admin without school ID
router.post('/register-school-admin', createSchoolAdmin);

// School Admin Management
router.get('/admins', getAllSchoolAdmins);
router.get('/admins/:id', getSchoolAdminById);
router.put('/admins/:id', updateSchoolAdmin);
router.delete('/admins/:id', deleteSchoolAdmin);
router.post('/admins/:id/reset-password', resetSchoolAdminPassword);
router.post('/admins/:id/toggle-status', toggleSchoolAdminStatus);

export default router;
