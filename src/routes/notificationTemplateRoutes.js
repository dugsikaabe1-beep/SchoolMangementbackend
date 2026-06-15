import express from 'express';
import NotificationTemplate from '../models/NotificationTemplate.js';
import NotificationTemplateTranslation from '../models/NotificationTemplateTranslation.js';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';

const router = express.Router();
router.use(protect);

const requireNotificationManager = [checkPermission(['settings.manage', 'settings.view'])];

// Create template
router.post('/', requireNotificationManager, async (req, res) => {
  try {
    const { name, code, category, subject, body, placeholders, type = 'all', isSystem = false } = req.body;
    const school = req.schoolId || req.user?.school?._id;
    const tpl = await NotificationTemplate.create({ name, code, category, subject, body, placeholders, type, isSystem, school, createdBy: req.user._id });
    res.status(201).json({ success: true, data: tpl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// List templates
router.get('/', requireNotificationManager, async (req, res) => {
  try {
    const school = req.schoolId || req.user?.school?._id;
    const templates = await NotificationTemplate.find({ school }).sort({ createdAt: -1 });
    res.json({ success: true, data: templates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get template
router.get('/:id', requireNotificationManager, async (req, res) => {
  try {
    const tpl = await NotificationTemplate.findById(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, data: tpl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update template
router.put('/:id', requireNotificationManager, async (req, res) => {
  try {
    const updates = req.body;
    const tpl = await NotificationTemplate.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ success: true, data: tpl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Soft delete template
router.delete('/:id', requireNotificationManager, async (req, res) => {
  try {
    await NotificationTemplate.findByIdAndUpdate(req.params.id, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add/Update translation
router.post('/:id/translations', requireNotificationManager, async (req, res) => {
  try {
    const { language, subject, body, placeholders } = req.body;
    const tplId = req.params.id;
    const existing = await NotificationTemplateTranslation.findOne({ templateId: tplId, language });
    if (existing) {
      existing.subject = subject;
      existing.body = body;
      existing.placeholders = placeholders || existing.placeholders;
      await existing.save();
      return res.json({ success: true, data: existing });
    }
    const tr = await NotificationTemplateTranslation.create({ templateId: tplId, language, subject, body, placeholders });
    res.status(201).json({ success: true, data: tr });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// List translations
router.get('/:id/translations', requireNotificationManager, async (req, res) => {
  try {
    const tplId = req.params.id;
    const translations = await NotificationTemplateTranslation.find({ templateId: tplId });
    res.json({ success: true, data: translations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
