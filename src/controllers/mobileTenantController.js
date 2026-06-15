import asyncHandler from 'express-async-handler';
import { isValidSubdomainLabel } from '../utils/securityUtils.js';
import { getTenantConfig } from '../services/mobileTenantService.js';

/**
 * @desc    Mobile app tenant config (branding + public preview)
 * @route   GET /api/mobile/tenant/config/:tenantId
 * @access  Public
 */
export const getMobileTenantConfig = asyncHandler(async (req, res) => {
  const tenantId = String(req.params.tenantId || '')
    .trim()
    .toLowerCase();
  const branchId = req.headers['x-branch-id'] || req.query.branchId || null;

  console.log('[MobileTenantController]', {
    tenantId,
    branchId,
    path: req.originalUrl,
    controller: 'getMobileTenantConfig',
  });

  if (!tenantId || tenantId === 'default' || !isValidSubdomainLabel(tenantId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid tenant id',
      userMessage: 'School tenant id is missing or invalid.',
    });
  }

  const result = await getTenantConfig({
    tenantId,
    branchId,
    path: req.originalUrl,
  });

  if (result.status !== 200) {
    return res.status(result.status).json({
      success: false,
      message: result.error,
      userMessage: result.error,
    });
  }

  res.json(result.data);
});
