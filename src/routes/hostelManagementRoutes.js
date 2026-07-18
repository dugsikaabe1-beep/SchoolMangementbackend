import express from 'express';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { injectBranch, injectOwnership } from '../middlewares/tenantMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { getHostelAttendance, markHostelAttendance, getBedAllocations, createBedAllocation, updateBedAllocation, deleteBedAllocation, getHostelOccupancy } from '../controllers/hostelController.js';

const router = express.Router();
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(checkSubscription);
router.use(checkModuleAccess('hostel'));
router.use(auditMiddleware('HOSTEL'));

router.route('/attendance').get(checkPermission('settings.view'), asyncHandler(getHostelAttendance)).post(checkPermission('settings.manage'), asyncHandler(markHostelAttendance));
router.get('/occupancy', checkPermission('settings.view'), asyncHandler(getHostelOccupancy));
router.route('/bed-allocations').get(checkPermission('settings.view'), asyncHandler(getBedAllocations)).post(checkPermission('settings.manage'), asyncHandler(createBedAllocation));
router.route('/bed-allocations/:id').put(checkPermission('settings.manage'), asyncHandler(updateBedAllocation)).delete(checkPermission('settings.manage'), asyncHandler(deleteBedAllocation));

export default router;
