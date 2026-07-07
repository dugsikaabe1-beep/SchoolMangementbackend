import express from 'express';
import { getSchools, getPublicContent, getPublicEvents, getPublicBranches } from '../controllers/publicContentController.js';
import { createLead } from '../controllers/leadController.js';
import { logError } from '../controllers/errorLogController.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import Plan from '../models/Plan.js';
import { FEATURE_REGISTRY } from '../config/featureRegistry.js';

const router = express.Router();

// Publicly accessible routes
router.get('/schools', asyncHandler(getSchools));
router.get('/content/:schoolId?', asyncHandler(getPublicContent));
router.get('/events/:schoolId?', asyncHandler(getPublicEvents));
router.get('/branches/:schoolId', asyncHandler(getPublicBranches));

// Lead capture
router.post('/leads', asyncHandler(createLead));

// Error logging from client
router.post('/log-error', asyncHandler(logError));

/**
 * @desc    Get all active plans (public — no auth required)
 * @route   GET /api/v1/public/plans
 * @access  Public
 */
router.get('/plans', asyncHandler(async (req, res) => {
  const plans = await Plan.find({ status: 'active' }).sort({ monthlyPrice: 1 }).lean();
  
  // Transform plans to include full feature list based on FEATURE_REGISTRY
  const transformedPlans = plans.map(plan => {
    const planFeatures = plan.features || [];
    const isAllModules = planFeatures.includes('ALL_MODULES');
    
    const features = FEATURE_REGISTRY.map(f => ({
      name: f.label,
      code: f.code,
      included: isAllModules || planFeatures.includes(f.code)
    }));

    return {
      ...plan,
      features
    };
  });

  res.json({ success: true, data: transformedPlans });
}));

export default router;
