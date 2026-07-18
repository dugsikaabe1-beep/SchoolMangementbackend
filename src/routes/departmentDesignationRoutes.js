import express from 'express';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { injectBranch, injectOwnership } from '../middlewares/tenantMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { getDepartments, getDepartmentById, createDepartment, updateDepartment, deleteDepartment, getDesignations, createDesignation, updateDesignation, deleteDesignation } from '../controllers/departmentDesignationController.js';

const router = express.Router();
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(auditMiddleware('DEPARTMENTS'));

router.route('/departments').get(asyncHandler(getDepartments)).post(checkPermission('settings.manage'), asyncHandler(createDepartment));
router.route('/departments/:id').get(asyncHandler(getDepartmentById)).put(checkPermission('settings.manage'), asyncHandler(updateDepartment)).delete(checkPermission('settings.manage'), asyncHandler(deleteDepartment));
router.route('/designations').get(asyncHandler(getDesignations)).post(checkPermission('settings.manage'), asyncHandler(createDesignation));
router.route('/designations/:id').put(checkPermission('settings.manage'), asyncHandler(updateDesignation)).delete(checkPermission('settings.manage'), asyncHandler(deleteDesignation));

export default router;
