import express from 'express';
import { protect, authorizeRoles } from '../middlewares/authMiddleware.js';
import { requireFeature } from '../middlewares/featureAccess.js';
import {
  createBackup,
  getBackups,
  restoreBackup,
  verifyBackup,
} from '../controllers/backupController.js';

const router = express.Router();

router.use(protect);
router.use(requireFeature('backups'));

router.get('/', getBackups);
router.post('/create', createBackup);
router.post('/restore', authorizeRoles('superadmin', 'schooladmin'), restoreBackup);
router.get('/verify/:fileName', verifyBackup);

export default router;
