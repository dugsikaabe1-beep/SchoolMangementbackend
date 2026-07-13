import express from 'express';
import { protect, checkPermission, authorizeRoles } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { injectBranch, injectOwnership } from '../middlewares/tenantMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import {
  getLeaves,
  getMyLeaves,
  getLeaveById,
  applyLeave,
  createLeaveForEmployee,
  updateLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
  deleteLeave,
  getLeaveStats,
} from '../controllers/leaveController.js';

const router = express.Router();

router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(checkSubscription);
router.use(auditMiddleware('LEAVE_MANAGEMENT'));

// ── Self-service routes (teachers can apply for their own leave) ──────────────
// Teachers apply for leave
router.post('/apply', asyncHandler(applyLeave));

// Teachers view their own leave
router.get('/my-leaves', asyncHandler(getMyLeaves));

// Cancel own leave
router.post('/:id/cancel', asyncHandler(cancelLeave));

// ── Admin routes ──────────────────────────────────────────────────────────────
// Get all leaves (admin)
router.get('/', checkPermission('teachers.view'), asyncHandler(getLeaves));

// Stats
router.get('/stats', checkPermission('teachers.view'), asyncHandler(getLeaveStats));

// Create leave for employee (admin)
router.post('/', checkPermission('teachers.manage'), asyncHandler(createLeaveForEmployee));

// Get leave by ID (admin or owner - ownership checked inside controller)
router.get('/:id', asyncHandler(getLeaveById));

// Update pending leave
router.put('/:id', asyncHandler(updateLeave));

// Approve / reject (admin only)
router.post('/:id/approve', checkPermission('teachers.manage'), asyncHandler(approveLeave));
router.post('/:id/reject',  checkPermission('teachers.manage'), asyncHandler(rejectLeave));

// Delete (admin only)
router.delete('/:id', checkPermission('teachers.manage'), asyncHandler(deleteLeave));

export default router;
