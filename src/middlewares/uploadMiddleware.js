import multer from 'multer';
import { CLOUDINARY_CONFIG, validateFileSize } from '../config/cloudinary.js';

// Store files in memory (buffer) — NO local disk storage (Security & Performance)
const storage = multer.memoryStorage();

const getExtension = (fileName = '') => fileName.split('.').pop()?.toLowerCase() || '';

const hasSuspiciousName = (fileName = '') => {
  const normalized = String(fileName).toLowerCase();
  return (
    normalized.includes('\0') ||
    /[<>:"\\|?*]/.test(normalized) ||
    /\.(php|phtml|asp|aspx|jsp|js|mjs|cjs|html|htm|sh|bat|cmd|ps1|exe|dll|svg)(?:\.|$)/i.test(normalized)
  );
};

const isAllowedByMimeMap = (mimeMap, file) => {
  const ext = getExtension(file.originalname);
  return Boolean(mimeMap[ext]?.includes(file.mimetype));
};

// Reusable file filter logic. Extension and MIME type must both match.
const createFilter = (allowedExtensions, mimeMap, errorMessage) => {
  return (req, file, cb) => {
    const ext = getExtension(file.originalname);

    if (hasSuspiciousName(file.originalname)) {
      return cb(new Error('Unsafe file name. Please rename the file and try again.'), false);
    }

    if (!allowedExtensions.includes(ext) || !isAllowedByMimeMap(mimeMap, file)) {
      return cb(new Error(errorMessage || 'File type not allowed'), false);
    }

    if (file.size && !validateFileSize(file.size)) {
      return cb(new Error('File exceeds the maximum allowed size.'), false);
    }

    return cb(null, true);
  };
};

// Excel Upload Middleware (for imports)
export const uploadExcel = multer({
  storage,
  fileFilter: createFilter(
    ['xlsx', 'xls', 'csv'],
    CLOUDINARY_CONFIG.DOCUMENT_MIME_TYPES,
    'Only Excel (.xlsx, .xls) and CSV files are allowed.'
  ),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max for Excel
}).single('file');

// Image Upload Middleware (Students, Teachers, Logos, etc.)
export const uploadImageMiddleware = multer({
  storage,
  fileFilter: createFilter(
    CLOUDINARY_CONFIG.ALLOWED_IMAGE_FORMATS,
    CLOUDINARY_CONFIG.IMAGE_MIME_TYPES,
    `Only images (${CLOUDINARY_CONFIG.ALLOWED_IMAGE_FORMATS.join(', ')}) are allowed.`
  ),
  limits: { fileSize: CLOUDINARY_CONFIG.MAX_FILE_SIZE }, // 10 MB max
}).single('image');

// Document Upload Middleware (Assignments, Reports, etc.)
export const uploadDocumentMiddleware = multer({
  storage,
  fileFilter: createFilter(
    CLOUDINARY_CONFIG.ALLOWED_DOC_FORMATS,
    CLOUDINARY_CONFIG.DOCUMENT_MIME_TYPES,
    `Only documents (${CLOUDINARY_CONFIG.ALLOWED_DOC_FORMATS.join(', ')}) are allowed.`
  ),
  limits: { fileSize: CLOUDINARY_CONFIG.MAX_FILE_SIZE }, // 10 MB max
}).single('file');

// Generic Media Middleware (Images + Documents)
export const uploadMediaMiddleware = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = getExtension(file.originalname);
    const isImage = CLOUDINARY_CONFIG.ALLOWED_IMAGE_FORMATS.includes(ext) &&
      isAllowedByMimeMap(CLOUDINARY_CONFIG.IMAGE_MIME_TYPES, file);
    const isDoc = CLOUDINARY_CONFIG.ALLOWED_DOC_FORMATS.includes(ext) &&
      isAllowedByMimeMap(CLOUDINARY_CONFIG.DOCUMENT_MIME_TYPES, file);

    if (hasSuspiciousName(file.originalname)) {
      return cb(new Error('Unsafe file name. Please rename the file and try again.'), false);
    }

    if (!isImage && !isDoc) {
      return cb(new Error('Invalid file type. Only images and documents are allowed.'), false);
    }

    return cb(null, true);
  },
  limits: { fileSize: CLOUDINARY_CONFIG.MAX_FILE_SIZE }, // 10 MB max
}).single('media');
