import asyncHandler from 'express-async-handler';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';
import { logAction } from '../utils/auditLogger.js';

const ALLOWED_UPLOAD_CATEGORIES = new Set([
  'student',
  'teacher',
  'school',
  'logo',
  'event',
  'assignment',
  'report',
  'announcement',
  'general',
]);

const resolveUploadTenant = (req) => {
  return req.schoolId || req.tenantId || req.school?.subdomain || req.user?.school?.subdomain || (req.user?._id ? `pending-${req.user._id}` : null);
};

/**
 * @desc    General purpose upload to Cloudinary
 * @route   POST /api/upload
 * @access  Private
 */
export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  const requestedCategory = String(req.body.category || 'general').trim().toLowerCase();
  if (!ALLOWED_UPLOAD_CATEGORIES.has(requestedCategory)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid upload category',
      userMessage: 'Please choose a valid upload category.',
    });
  }

  const tenantId = resolveUploadTenant(req);
  if (!tenantId) {
    return res.status(403).json({
      success: false,
      message: 'Tenant context required for uploads',
      userMessage: 'Please access uploads from a valid school session.',
    });
  }

  try {
    const result = await uploadToCloudinary(req.file, tenantId, requestedCategory);

    logAction(req, {
      action: 'MEDIA_UPLOAD',
      module: 'media',
      targetId: result.publicId,
      details: {
        category: requestedCategory,
        tenantId: String(tenantId),
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        publicId: result.publicId,
        url: result.url,
      },
    });

    res.json({
      ...result,
      success: true
    });
  } catch (error) {
    console.error('Upload Controller Error:', error);
    res.status(500);
    throw new Error(`Upload failed: ${error.message}`);
  }
});

/**
 * @desc    Delete file from Cloudinary
 * @route   DELETE /api/upload/:publicId
 * @access  Private
 */
export const deleteFile = asyncHandler(async (req, res) => {
  const publicId = req.params.publicId || req.body.publicId || req.query.publicId;

  if (!publicId) {
    res.status(400);
    throw new Error('Public ID is required');
  }

  try {
    await deleteFromCloudinary(publicId);
    logAction(req, {
      action: 'MEDIA_DELETE',
      module: 'media',
      targetId: publicId,
      details: { publicId },
    });
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Delete Controller Error:', error);
    res.status(500);
    throw new Error(`Deletion failed: ${error.message}`);
  }
});
