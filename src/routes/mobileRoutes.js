import express from 'express';
import { getMobileTenantConfig } from '../controllers/mobileTenantController.js';

const router = express.Router();

router.get('/tenant/config/:tenantId', getMobileTenantConfig);

export default router;
