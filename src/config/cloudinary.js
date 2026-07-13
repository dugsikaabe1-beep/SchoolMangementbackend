import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Cloudinary configuration options
export const CLOUDINARY_CONFIG = {
  // Maximum file size: 10MB
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB in bytes
  
  // Allowed image formats. SVG is intentionally excluded because it can carry
  // executable markup when rendered back into the browser.
  ALLOWED_IMAGE_FORMATS: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  
  // Allowed document formats
  ALLOWED_DOC_FORMATS: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'],

  IMAGE_MIME_TYPES: {
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    webp: ['image/webp'],
    gif: ['image/gif'],
  },

  DOCUMENT_MIME_TYPES: {
    pdf: ['application/pdf'],
    doc: ['application/msword'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    xls: ['application/vnd.ms-excel'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ppt: ['application/vnd.ms-powerpoint'],
    pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    csv: ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
  },
  
  // Folder structure
  FOLDER_STRUCTURE: {
    BASE: 'dugsihub',
    SCHOOLS: 'schools',
    STUDENTS: 'students',
    TEACHERS: 'teachers',
    EVENTS: 'events',
    ASSIGNMENTS: 'assignments',
    REPORTS: 'reports',
    LOGOS: 'logos',
    ANNOUNCEMENTS: 'announcements',
  },
  
  // Image optimization settings
  IMAGE_OPTIMIZATION: {
    quality: 'auto:good',
    fetch_format: 'auto',
    progressive: true,
  },
  
  // Thumbnail settings
  THUMBNAIL: {
    width: 300,
    height: 300,
    crop: 'fill',
    gravity: 'face',
  },
};

/**
 * Validate file type
 * @param {string} mimetype - File MIME type
 * @param {string} originalname - Original file name
 * @returns {boolean} - Whether file type is allowed
 */
export const validateFileType = (mimetype, originalname) => {
  const ext = originalname.split('.').pop().toLowerCase();
  const allowedMimes = {
    ...CLOUDINARY_CONFIG.IMAGE_MIME_TYPES,
    ...CLOUDINARY_CONFIG.DOCUMENT_MIME_TYPES,
  };

  return Boolean(allowedMimes[ext]?.includes(mimetype));
};

/**
 * Validate file size
 * @param {number} size - File size in bytes
 * @returns {boolean} - Whether file size is within limit
 */
export const validateFileSize = (size) => {
  return size <= CLOUDINARY_CONFIG.MAX_FILE_SIZE;
};

/**
 * Generate Cloudinary folder path based on tenant and type
 * @param {string} tenantId - School tenant ID
 * @param {string} type - Type of upload (students, teachers, logos, etc.)
 * @returns {string} - Cloudinary folder path
 */
export const generateFolderPath = (tenantId, type) => {
  const { BASE, FOLDER_STRUCTURE } = CLOUDINARY_CONFIG;
  const safeTenantId = String(tenantId || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'default';
  
  // Map type to folder
  const typeMap = {
    student: FOLDER_STRUCTURE.STUDENTS,
    teacher: FOLDER_STRUCTURE.TEACHERS,
    school: FOLDER_STRUCTURE.SCHOOLS,
    logo: FOLDER_STRUCTURE.LOGOS,
    event: FOLDER_STRUCTURE.EVENTS,
    assignment: FOLDER_STRUCTURE.ASSIGNMENTS,
    report: FOLDER_STRUCTURE.REPORTS,
    announcement: FOLDER_STRUCTURE.ANNOUNCEMENTS,
  };
  
  const folder = typeMap[type] || FOLDER_STRUCTURE.SCHOOLS;
  return `${BASE}/${safeTenantId}/${folder}`;
};

/**
 * Upload file to Cloudinary using Stream (Production Grade)
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {string} folder - Cloudinary folder path
 * @param {string} publicId - Public ID for the file
 * @param {Object} options - Additional upload options
 * @returns {Promise<Object>} - Cloudinary upload result
 */
export const uploadToCloudinary = (fileBuffer, folder, publicId, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder,
      public_id: publicId,
      resource_type: options.resource_type || 'auto',
      ...CLOUDINARY_CONFIG.IMAGE_OPTIMIZATION,
      ...options,
    };

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        console.error('Cloudinary upload error:', error);
        return reject(new Error(`Failed to upload to Cloudinary: ${error.message}`));
      }
      resolve(result);
    });

    Readable.from(fileBuffer).pipe(stream);
  });
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Public ID of the file to delete
 * @returns {Promise<Object>} - Cloudinary delete result
 */
export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error(`Failed to delete from Cloudinary: ${error.message}`);
  }
};

/**
 * Generate optimized image URL
 * @param {string} publicId - Public ID of the image
 * @param {Object} transformations - Image transformations
 * @returns {string} - Optimized image URL
 */
export const getOptimizedImageUrl = (publicId, transformations = {}) => {
  const defaultTransformations = {
    ...CLOUDINARY_CONFIG.IMAGE_OPTIMIZATION,
    ...transformations,
  };
  
  return cloudinary.url(publicId, defaultTransformations);
};

/**
 * Generate thumbnail URL
 * @param {string} publicId - Public ID of the image
 * @returns {string} - Thumbnail URL
 */
export const getThumbnailUrl = (publicId) => {
  return cloudinary.url(publicId, CLOUDINARY_CONFIG.THUMBNAIL);
};

export default cloudinary;
