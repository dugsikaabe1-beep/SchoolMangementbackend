import express from 'express';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { injectBranch, injectOwnership } from '../middlewares/tenantMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier, getInventoryItems, createInventoryItem, updateInventoryItem, deleteInventoryItem, getStockMovements, createStockMovement, getInventoryStats } from '../controllers/inventoryController.js';

const router = express.Router();
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(checkSubscription);
router.use(checkModuleAccess('assets'));
router.use(auditMiddleware('INVENTORY'));

router.route('/suppliers').get(checkPermission('settings.view'), asyncHandler(getSuppliers)).post(checkPermission('settings.manage'), asyncHandler(createSupplier));
router.route('/suppliers/:id').put(checkPermission('settings.manage'), asyncHandler(updateSupplier)).delete(checkPermission('settings.manage'), asyncHandler(deleteSupplier));

router.route('/items').get(checkPermission('settings.view'), asyncHandler(getInventoryItems)).post(checkPermission('settings.manage'), asyncHandler(createInventoryItem));
router.route('/items/:id').put(checkPermission('settings.manage'), asyncHandler(updateInventoryItem)).delete(checkPermission('settings.manage'), asyncHandler(deleteInventoryItem));
router.get('/items/stats', checkPermission('settings.view'), asyncHandler(getInventoryStats));

router.route('/movements').get(checkPermission('settings.view'), asyncHandler(getStockMovements)).post(checkPermission('settings.manage'), asyncHandler(createStockMovement));

export default router;
