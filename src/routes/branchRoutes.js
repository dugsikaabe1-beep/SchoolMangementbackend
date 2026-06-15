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
import { checkPlanLimits } from '../middlewares/limitMiddleware.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { injectOwnership } from '../middlewares/tenantMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(injectOwnership);
router.use(auditMiddleware('BRANCH_MANAGEMENT'));
router.use(checkModuleAccess('branches'));

router.route('/')
  .get(checkPermission('branches.view'), getBranches)
  .post(checkPermission('branches.manage'), checkPlanLimits('branches'), createBranch);

router.route('/:id')
  .put(checkPermission('branches.manage'), updateBranch)
  .delete(checkPermission('branches.manage'), deleteBranch);

router.put('/:id/toggle-status', checkPermission('branches.manage'), toggleBranchStatus);

router.get('/:id/stats', checkPermission('branches.view'), getBranchStats);

export default router;
