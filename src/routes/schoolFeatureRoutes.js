import express from 'express';
import {
  getSchoolFeatures,
  updateSchoolFeature,
  resetSchoolFeatures
} from '../controllers/schoolFeatureController.js';
import { protect, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Only super admin can access these routes
router.use(protect);
router.use(authorizeRoles('superadmin', 'super_admin'));

router.get('/:schoolId', getSchoolFeatures);
router.put('/:schoolId/:featureKey', updateSchoolFeature);
router.delete('/:schoolId', resetSchoolFeatures);

export default router;
