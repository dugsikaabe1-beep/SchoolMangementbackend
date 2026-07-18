import express from 'express';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { injectBranch, injectOwnership } from '../middlewares/tenantMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { getApiKeys, createApiKey, revokeApiKey, deleteApiKey, getLoginHistory, getLoginStats, getIpRestrictions, createIpRestriction, updateIpRestriction, deleteIpRestriction, getPasswordPolicy, updatePasswordPolicy } from '../controllers/securityAdminController.js';

const router = express.Router();
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(checkSubscription);
router.use(auditMiddleware('SECURITY'));

router.route('/api-keys').get(checkPermission('settings.manage'), asyncHandler(getApiKeys)).post(checkPermission('settings.manage'), asyncHandler(createApiKey));
router.post('/api-keys/:id/revoke', checkPermission('settings.manage'), asyncHandler(revokeApiKey));
router.delete('/api-keys/:id', checkPermission('settings.manage'), asyncHandler(deleteApiKey));

router.get('/login-history', checkPermission('settings.view'), asyncHandler(getLoginHistory));
router.get('/login-stats', checkPermission('settings.view'), asyncHandler(getLoginStats));

router.route('/ip-restrictions').get(checkPermission('settings.manage'), asyncHandler(getIpRestrictions)).post(checkPermission('settings.manage'), asyncHandler(createIpRestriction));
router.route('/ip-restrictions/:id').put(checkPermission('settings.manage'), asyncHandler(updateIpRestriction)).delete(checkPermission('settings.manage'), asyncHandler(deleteIpRestriction));

router.get('/password-policy', checkPermission('settings.manage'), asyncHandler(getPasswordPolicy));
router.put('/password-policy', checkPermission('settings.manage'), asyncHandler(updatePasswordPolicy));

export default router;
