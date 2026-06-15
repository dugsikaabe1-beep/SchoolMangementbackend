import NotificationTemplate from '../models/NotificationTemplate.js';
import asyncHandler from 'express-async-handler';
import { logAction } from '../utils/auditLogger.js';

// @desc    Get all notification templates for a school
// @route   GET /api/admin/notification-templates
// @access  Private (School Admin/Super Admin only)
export const getNotificationTemplates = asyncHandler(async (req, res) => {
  const school = req.user.school;
  if (!school) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const templates = await NotificationTemplate.find({
    school,
    isDeleted: false,
    isActive: { $in: [true, false] }
  }).sort({ isSystem: -1, name: 1 });

  res.json(templates);
});

// @desc    Get single notification template
// @route   GET /api/admin/notification-templates/:id
// @access  Private (School Admin/Super Admin only)
export const getNotificationTemplateById = asyncHandler(async (req, res) => {
  const school = req.user.school;
  const template = await NotificationTemplate.findOne({
    _id: req.params.id,
    school,
    isDeleted: false
  });

  if (!template) {
    res.status(404);
    throw new Error('Notification template not found');
  }

  res.json(template);
});

// @desc    Create a new notification template
// @route   POST /api/admin/notification-templates
// @access  Private (School Admin/Super Admin only)
export const createNotificationTemplate = asyncHandler(async (req, res) => {
  const school = req.user.school;
  if (!school) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const {
    name,
    code,
    category,
    subject,
    body,
    placeholders,
    type
  } = req.body;

  // Check for duplicate code within the school
  const existingTemplate = await NotificationTemplate.findOne({
    school,
    code,
    isDeleted: false
  });

  if (existingTemplate) {
    res.status(400);
    throw new Error('Template with this code already exists');
  }

  const template = await NotificationTemplate.create({
    name,
    code,
    category: category || 'general',
    subject,
    body,
    placeholders: placeholders || [],
    type: type || 'all',
    school,
    createdBy: req.user._id,
    updatedBy: req.user._id
  });

  await logAction(req.user._id, {
    action: 'CREATE_NOTIFICATION_TEMPLATE',
    module: 'NOTIFICATIONS',
    targetId: template._id,
    details: {
      templateName: name,
      templateCode: code
    }
  });

  res.status(201).json(template);
});

// @desc    Update a notification template
// @route   PUT /api/admin/notification-templates/:id
// @access  Private (School Admin/Super Admin only)
export const updateNotificationTemplate = asyncHandler(async (req, res) => {
  const school = req.user.school;
  const template = await NotificationTemplate.findOne({
    _id: req.params.id,
    school,
    isDeleted: false
  });

  if (!template) {
    res.status(404);
    throw new Error('Notification template not found');
  }

  if (template.isSystem) {
    res.status(403);
    throw new Error('Cannot modify system templates');
  }

  const {
    name,
    code,
    category,
    subject,
    body,
    placeholders,
    type,
    isActive
  } = req.body;

  // Check for duplicate code if code is being changed
  if (code && code !== template.code) {
    const existingTemplate = await NotificationTemplate.findOne({
      school,
      code,
      isDeleted: false,
      _id: { $ne: template._id }
    });

    if (existingTemplate) {
      res.status(400);
      throw new Error('Template with this code already exists');
    }
    template.code = code;
  }

  if (name) template.name = name;
  if (category) template.category = category;
  if (subject) template.subject = subject;
  if (body) template.body = body;
  if (placeholders) template.placeholders = placeholders;
  if (type) template.type = type;
  if (isActive !== undefined) template.isActive = isActive;

  template.updatedBy = req.user._id;

  const updatedTemplate = await template.save();

  await logAction(req.user._id, {
    action: 'UPDATE_NOTIFICATION_TEMPLATE',
    module: 'NOTIFICATIONS',
    targetId: template._id,
    details: {
      templateName: updatedTemplate.name,
      templateCode: updatedTemplate.code
    }
  });

  res.json(updatedTemplate);
});

// @desc    Soft delete a notification template
// @route   DELETE /api/admin/notification-templates/:id
// @access  Private (School Admin/Super Admin only)
export const deleteNotificationTemplate = asyncHandler(async (req, res) => {
  const school = req.user.school;
  const template = await NotificationTemplate.findOne({
    _id: req.params.id,
    school,
    isDeleted: false
  });

  if (!template) {
    res.status(404);
    throw new Error('Notification template not found');
  }

  if (template.isSystem) {
    res.status(403);
    throw new Error('Cannot delete system templates');
  }

  template.isDeleted = true;
  template.deletedAt = Date.now();
  template.deletedBy = req.user._id;

  await template.save();

  await logAction(req.user._id, {
    action: 'DELETE_NOTIFICATION_TEMPLATE',
    module: 'NOTIFICATIONS',
    targetId: template._id,
    details: {
      templateName: template.name,
      templateCode: template.code
    }
  });

  res.json({ message: 'Notification template deleted successfully' });
});

// @desc    Seed system notification templates for a new school
// @route   POST /api/admin/notification-templates/seed
// @access  Private (Super Admin only)
export const seedSystemTemplates = asyncHandler(async (req, res) => {
  const school = req.user.school;
  if (!school) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const systemTemplates = [
    {
      name: 'Fee Reminder',
      code: 'fee_reminder',
      category: 'finance',
      subject: 'Fee Payment Reminder for {{studentName}}',
      body: 'Dear {{parentName}},\n\nThis is a reminder that the fee of {{amount}} for {{studentName}} is due on {{dueDate}}. Please make the payment at your earliest convenience.\n\nThank you,\n{{schoolName}}',
      placeholders: ['studentName', 'parentName', 'amount', 'dueDate', 'schoolName'],
      type: 'all',
      isSystem: true
    },
    {
      name: 'Attendance Alert',
      code: 'attendance_alert',
      category: 'attendance',
      subject: 'Attendance Alert for {{studentName}}',
      body: 'Dear {{parentName}},\n\n{{studentName}} was marked {{status}} on {{date}}. Please ensure regular attendance for academic success.\n\nThank you,\n{{schoolName}}',
      placeholders: ['studentName', 'parentName', 'status', 'date', 'schoolName'],
      type: 'all',
      isSystem: true
    },
    {
      name: 'Exam Results Published',
      code: 'exam_results',
      category: 'academic',
      subject: 'Exam Results Published for {{studentName}}',
      body: 'Dear {{parentName}},\n\nExam results for {{studentName}} in {{subject}} have been published. Please check the portal for details.\n\nThank you,\n{{schoolName}}',
      placeholders: ['studentName', 'parentName', 'subject', 'schoolName'],
      type: 'all',
      isSystem: true
    },
    {
      name: 'Admission Approval',
      code: 'admission_approval',
      category: 'admission',
      subject: 'Admission Approved for {{studentName}}',
      body: 'Dear {{parentName}},\n\nWe are pleased to inform you that {{studentName}}\'s admission has been approved. Please complete the enrollment process by {{enrollmentDeadline}}.\n\nThank you,\n{{schoolName}}',
      placeholders: ['studentName', 'parentName', 'enrollmentDeadline', 'schoolName'],
      type: 'all',
      isSystem: true
    },
    {
      name: 'School Event Invitation',
      code: 'event_invitation',
      category: 'events',
      subject: 'Invitation to {{eventName}} at {{schoolName}}',
      body: 'Dear {{parentName}},\n\nYou are invited to {{eventName}} on {{eventDate}} at {{eventTime}}. We look forward to seeing you there!\n\nThank you,\n{{schoolName}}',
      placeholders: ['parentName', 'eventName', 'eventDate', 'eventTime', 'schoolName'],
      type: 'all',
      isSystem: true
    }
  ];

  const createdTemplates = [];
  for (const templateData of systemTemplates) {
    const existing = await NotificationTemplate.findOne({
      school,
      code: templateData.code,
      isDeleted: false
    });

    if (!existing) {
      const template = await NotificationTemplate.create({
        ...templateData,
        school,
        createdBy: req.user._id,
        updatedBy: req.user._id
      });
      createdTemplates.push(template);
    }
  }

  await logAction(req.user._id, {
    action: 'SEED_SYSTEM_TEMPLATES',
    module: 'NOTIFICATIONS',
    details: {
      templatesCreated: createdTemplates.length
    }
  });

  res.status(201).json({
    message: `Seeded ${createdTemplates.length} system templates`,
    templates: createdTemplates
  });
});
