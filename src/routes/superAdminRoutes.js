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
  deleteSchoolAdmin,
  getSubscriptions,
  reviewSubscription,
  // Enterprise Expansion
  getLeads,
  updateLead,
  createSystemAnnouncement,
  getSystemAnnouncements,
  manageKnowledgeBase,
  toggleMaintenanceMode,
  manageIntegrations,
  updateIntegration,
  getDisasterRecoveryStatus,
  getSuperAdminAnalytics,
} from '../controllers/superAdminController.js';
import { getSystemHealth, getBusinessMetrics } from '../controllers/superAdminDashController.js';
import { getAllLeads, updateLeadStatus } from '../controllers/leadController.js';
import { getTickets, respondToTicket } from '../controllers/supportController.js';
import { getErrorLogs, updateErrorStatus } from '../controllers/errorLogController.js';
import {
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  archivePlan,
  clonePlan,
  assignPlanToSchool,
  getSaasAnalytics,
} from '../controllers/planController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { blockTenantContextForSuperAdminAuth } from '../middlewares/tenantMiddleware.js';
import { checkPlanLimits } from '../middlewares/limitMiddleware.js';
import { FEATURE_REGISTRY, FEATURES_BY_CATEGORY } from '../config/featureRegistry.js';

const router = express.Router();

// Public routes — must not run under a school tenant host
router.get('/check-exists', blockTenantContextForSuperAdminAuth, asyncHandler(checkSuperAdminExists));
router.post('/register', blockTenantContextForSuperAdminAuth, asyncHandler(registerSuperAdmin));
router.post('/login', blockTenantContextForSuperAdminAuth, asyncHandler(superAdminLogin));

// Protected routes (Super Admin only)
router.use(asyncHandler(protect));

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
router.get('/dashboard/stats', asyncHandler(getDashboardStats));
router.get('/health', asyncHandler(getSystemHealth));
router.get('/business-analytics', asyncHandler(getBusinessMetrics));

// Leads Management
router.get('/leads', asyncHandler(getAllLeads));
router.put('/leads/:id', asyncHandler(updateLeadStatus));

// Tickets Management
router.get('/tickets', asyncHandler(getTickets));
router.post('/tickets/:id/respond', asyncHandler(respondToTicket));

// Schools Management
router.get('/schools', asyncHandler(getAllSchools));
router.get('/schools/:id', asyncHandler(getSchoolById));
router.put('/schools/:id', asyncHandler(updateSchool));
router.delete('/schools/:id', asyncHandler(deleteSchool));

// Subscription Management
router.put('/schools/:id/subscription', asyncHandler(updateSchoolSubscription));
router.post('/schools/:id/extend', asyncHandler(extendSubscription));

// Block/Unblock
router.post('/schools/:id/toggle-block', asyncHandler(toggleSchoolBlock));

// Create School Admin (simplified - Super Admin only provides email & password)
router.post('/schools/:id/admins', checkPlanLimits('admins'), asyncHandler(createSchoolAdmin));

// Alternative endpoint for creating school admin without school ID
router.post('/register-school-admin', checkPlanLimits('admins'), asyncHandler(createSchoolAdmin));

// School Admin Management
router.get('/admins', asyncHandler(getAllSchoolAdmins));
router.get('/admins/:id', asyncHandler(getSchoolAdminById));
router.put('/admins/:id', asyncHandler(updateSchoolAdmin));
router.delete('/admins/:id', asyncHandler(deleteSchoolAdmin));
router.post('/admins/:id/reset-password', asyncHandler(resetSchoolAdminPassword));
router.post('/admins/:id/toggle-status', asyncHandler(toggleSchoolAdminStatus));

// Plan Management (Super Admin)
router.get('/plans', asyncHandler(getPlans));
router.post('/plans', asyncHandler(createPlan));
router.get('/plans/:id', asyncHandler(getPlanById));
router.put('/plans/:id', asyncHandler(updatePlan));
router.delete('/plans/:id', asyncHandler(archivePlan));
router.post('/plans/:id/clone', asyncHandler(clonePlan));

// Feature Registry — returns all available features for the Plan UI matrix
router.get('/feature-registry', (req, res) => {
  res.json({ 
    success: true, 
    data: FEATURE_REGISTRY,
    byCategory: FEATURES_BY_CATEGORY 
  });
});

// Assign a Plan to a School
router.post('/schools/:id/assign-plan', asyncHandler(assignPlanToSchool));

// SaaS Analytics
router.get('/analytics', asyncHandler(getSaasAnalytics));
router.get('/analytics/advanced', asyncHandler(getSuperAdminAnalytics));

// Subscriptions Management
router.get('/subscriptions', asyncHandler(getSubscriptions));
router.post('/schools/:id/review-subscription', asyncHandler(reviewSubscription));

// System Announcements
router.get('/announcements', asyncHandler(getSystemAnnouncements));
router.post('/announcements', asyncHandler(createSystemAnnouncement));

// Knowledge Base
router.get('/knowledge-base', asyncHandler(manageKnowledgeBase));
router.post('/knowledge-base', asyncHandler(manageKnowledgeBase));

// Maintenance Mode
router.post('/maintenance/toggle', asyncHandler(toggleMaintenanceMode));

// Integrations
router.get('/integrations', asyncHandler(manageIntegrations));
router.put('/integrations/:id', asyncHandler(updateIntegration));

// Disaster Recovery
router.get('/recovery/status', asyncHandler(getDisasterRecoveryStatus));

// Error Monitoring
router.get('/errors', asyncHandler(getErrorLogs));
router.put('/errors/:id', asyncHandler(updateErrorStatus));

export default router;
