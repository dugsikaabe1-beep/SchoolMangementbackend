import express from 'express';
import {
  getRoles,
  createRole,
  updateRole,
  getPermissions,
  createPermission,
  updatePermission,
  deletePermission,
  assignRoleToBranch
} from '../controllers/rbacController.js';
import { protect, authorizeRoles } from '../middlewares/authMiddleware.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';

const router = express.Router();

// All RBAC routes require school admin or admin role
router.use(protect);
router.use(authorizeRoles('admin', 'schooladmin', 'school_admin'));

router.use('/roles', checkModuleAccess('roles'));
router.use('/assign-branch', checkModuleAccess('roles'));
router.route('/roles')
  .get(getRoles)
  .post(createRole);

router.route('/roles/:id')
  .put(updateRole);

router.put('/assign-branch/:branchId', assignRoleToBranch);

router.use('/permissions', checkModuleAccess('permissions'));
router.route('/permissions')
  .get(getPermissions)
  .post(createPermission);

router.route('/permissions/:id')
  .put(updatePermission)
  .delete(deletePermission);

export default router;
