import express from 'express';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { injectBranch, injectOwnership } from '../middlewares/tenantMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { getFuelLogs, createFuelLog, getVehicleMaintenance, createVehicleMaintenance, updateVehicleMaintenance, getTransportAllocations, createTransportAllocation, updateTransportAllocation, deleteTransportAllocation } from '../controllers/transportController.js';

const router = express.Router();
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(checkSubscription);
router.use(checkModuleAccess('transport'));
router.use(auditMiddleware('TRANSPORT'));

router.route('/fuel-logs').get(checkPermission('settings.view'), asyncHandler(getFuelLogs)).post(checkPermission('settings.manage'), asyncHandler(createFuelLog));
router.route('/maintenance').get(checkPermission('settings.view'), asyncHandler(getVehicleMaintenance)).post(checkPermission('settings.manage'), asyncHandler(createVehicleMaintenance));
router.route('/maintenance/:id').put(checkPermission('settings.manage'), asyncHandler(updateVehicleMaintenance));
router.route('/allocations').get(checkPermission('settings.view'), asyncHandler(getTransportAllocations)).post(checkPermission('settings.manage'), asyncHandler(createTransportAllocation));
router.route('/allocations/:id').put(checkPermission('settings.manage'), asyncHandler(updateTransportAllocation)).delete(checkPermission('settings.manage'), asyncHandler(deleteTransportAllocation));

export default router;
