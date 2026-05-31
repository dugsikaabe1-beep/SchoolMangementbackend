import asyncHandler from 'express-async-handler';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';

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

  const category = req.body.category || 'general';
  const tenantId = req.tenantId || req.school?.subdomain || 'default';

  try {
    const result = await uploadToCloudinary(req.file, tenantId, category);

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
  const { publicId } = req.params;

  if (!publicId) {
    res.status(400);
    throw new Error('Public ID is required');
  }

  try {
    await deleteFromCloudinary(publicId);
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
