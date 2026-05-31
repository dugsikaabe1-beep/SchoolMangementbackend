import { 
  uploadToCloudinary as uploadStream, 
  deleteFromCloudinary as deleteAsset,
  generateFolderPath,
  getThumbnailUrl
} from '../config/cloudinary.js';

/**
 * Higher-level service for handling Cloudinary uploads with tenant isolation.
 */
export const uploadToCloudinary = async (file, tenantId = 'default', category = 'general') => {
  try {
    if (!file || !file.buffer) {
      throw new Error('No file buffer provided for upload');
    }

    // Generate path: dugsihub/{tenantId}/{category}
    const folder = generateFolderPath(tenantId, category);
    
    // Generate a unique public ID
    const fileName = file.originalname.split('.')[0].replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const publicId = `${Date.now()}-${fileName}`;

    // Perform the upload
    const result = await uploadStream(file.buffer, folder, publicId, {
      resource_type: 'auto'
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      resourceType: result.resource_type,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      thumbnailUrl: getThumbnailUrl(result.public_id)
    };
  } catch (error) {
    console.error('CLOUDINARY SERVICE ERROR:', {
      message: error.message,
      tenant: tenantId,
      category
    });
    throw new Error(`Upload failed: ${error.message}`);
  }
};

/**
 * Securely Delete from Cloudinary
 */
export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  try {
    return await deleteAsset(publicId);
  } catch (error) {
    console.error('Cloudinary deletion failed:', error);
    throw error;
  }
};

export { getThumbnailUrl, getOptimizedImageUrl } from '../config/cloudinary.js';
