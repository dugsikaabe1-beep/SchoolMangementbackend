import express from 'express';
import {
  getNotificationTemplates,
  getNotificationTemplateById,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  duplicateNotificationTemplate,
  restoreNotificationTemplate,
  seedSystemTemplates
} from '../controllers/notificationTemplateController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { injectOwnership } from '../middlewares/tenantMiddleware.js';

const router = express.Router();
router.use(protect);
router.use(injectOwnership);

// List templates
router.get('/', getNotificationTemplates);

// Get template
router.get('/:id', getNotificationTemplateById);

// Create template
router.post('/', createNotificationTemplate);

// Update template
router.put('/:id', updateNotificationTemplate);

// Soft delete template
router.delete('/:id', deleteNotificationTemplate);

// Duplicate template
router.post('/:id/duplicate', duplicateNotificationTemplate);

// Restore template
router.post('/:id/restore', restoreNotificationTemplate);

// Seed system templates
router.post('/seed', seedSystemTemplates);

export default router;
