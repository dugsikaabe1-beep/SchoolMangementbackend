import express from 'express';
import { 
  getBranches, 
  createBranch, 
  updateBranch, 
  deleteBranch,
  getBranchStats,
  toggleBranchStatus
} from '../controllers/branchController.js';
import { 
  protect,
  checkPermission
} from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkPlanLimits } from '../middlewares/limitMiddleware.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { injectOwnership, injectBranch } from '../middlewares/tenantMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';

const router = express.Router();

// All routes require authentication
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(asyncHandler(injectAcademicYear));
router.use(injectOwnership);
router.use(auditMiddleware('BRANCH_MANAGEMENT'));
router.use(checkModuleAccess('branches'));

router.route('/')
  .get(checkPermission('branches.view'), asyncHandler(getBranches))
  .post(checkPermission('branches.manage'), checkPlanLimits('branches'), asyncHandler(createBranch));

router.route('/:id')
  .put(checkPermission('branches.manage'), asyncHandler(updateBranch))
  .delete(checkPermission('branches.manage'), asyncHandler(deleteBranch));

router.put('/:id/toggle-status', checkPermission('branches.manage'), asyncHandler(toggleBranchStatus));

router.get('/:id/stats', checkPermission('branches.view'), asyncHandler(getBranchStats));

export default router;
