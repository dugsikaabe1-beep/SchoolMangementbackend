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
  assignPlanToSchool,
  getSaasAnalytics,
} from '../controllers/planController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { blockTenantContextForSuperAdminAuth } from '../middlewares/tenantMiddleware.js';
import { checkPlanLimits } from '../middlewares/limitMiddleware.js';
import { FEATURE_REGISTRY, FEATURES_BY_CATEGORY } from '../config/featureRegistry.js';

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
router.get('/health', getSystemHealth);
router.get('/business-analytics', getBusinessMetrics);

// Leads Management
router.get('/leads', getAllLeads);
router.put('/leads/:id', updateLeadStatus);

// Tickets Management
router.get('/tickets', getTickets);
router.post('/tickets/:id/respond', respondToTicket);

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
router.post('/schools/:id/admins', checkPlanLimits('admins'), createSchoolAdmin);

// Alternative endpoint for creating school admin without school ID
router.post('/register-school-admin', checkPlanLimits('admins'), createSchoolAdmin);

// School Admin Management
router.get('/admins', getAllSchoolAdmins);
router.get('/admins/:id', getSchoolAdminById);
router.put('/admins/:id', updateSchoolAdmin);
router.delete('/admins/:id', deleteSchoolAdmin);
router.post('/admins/:id/reset-password', resetSchoolAdminPassword);
router.post('/admins/:id/toggle-status', toggleSchoolAdminStatus);

// Plan Management (Super Admin)
router.get('/plans', getPlans);
router.post('/plans', createPlan);
router.get('/plans/:id', getPlanById);
router.put('/plans/:id', updatePlan);
router.delete('/plans/:id', archivePlan);

// Feature Registry — returns all available features for the Plan UI matrix
router.get('/feature-registry', (req, res) => {
  res.json({ 
    success: true, 
    data: FEATURE_REGISTRY,
    byCategory: FEATURES_BY_CATEGORY 
  });
});

// Assign a Plan to a School
router.post('/schools/:id/assign-plan', assignPlanToSchool);

// SaaS Analytics
router.get('/analytics', getSaasAnalytics);
router.get('/analytics/advanced', getSuperAdminAnalytics);

// Subscriptions Management
router.get('/subscriptions', getSubscriptions);
router.post('/schools/:id/review-subscription', reviewSubscription);

// System Announcements
router.get('/announcements', getSystemAnnouncements);
router.post('/announcements', createSystemAnnouncement);

// Knowledge Base
router.get('/knowledge-base', manageKnowledgeBase);
router.post('/knowledge-base', manageKnowledgeBase);

// Maintenance Mode
router.post('/maintenance/toggle', toggleMaintenanceMode);

// Integrations
router.get('/integrations', manageIntegrations);
router.put('/integrations/:id', updateIntegration);

// Disaster Recovery
router.get('/recovery/status', getDisasterRecoveryStatus);

// Error Monitoring
router.get('/errors', getErrorLogs);
router.put('/errors/:id', updateErrorStatus);

export default router;
