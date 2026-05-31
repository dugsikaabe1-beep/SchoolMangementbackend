import multer from 'multer';
import { CLOUDINARY_CONFIG } from '../config/cloudinary.js';

// Store files in memory (buffer) — NO local disk storage (Security & Performance)
const storage = multer.memoryStorage();

// Reusable file filter logic
const createFilter = (allowedMimeTypes, allowedExtensions, errorMessage) => {
  return (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    const isMimeAllowed = allowedMimeTypes.some(type => file.mimetype.startsWith(type) || file.mimetype === type);
    const isExtAllowed = allowedExtensions.includes(ext);

    if (isMimeAllowed || isExtAllowed) {
      cb(null, true);
    } else {
      cb(new Error(errorMessage || 'File type not allowed'), false);
    }
  };
};

// Excel Upload Middleware (for imports)
export const uploadExcel = multer({
  storage,
  fileFilter: createFilter(
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'],
    ['xlsx', 'xls', 'csv'],
    'Only Excel (.xlsx, .xls) and CSV files are allowed.'
  ),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max for Excel
}).single('file');

// Image Upload Middleware (Students, Teachers, Logos, etc.)
export const uploadImageMiddleware = multer({
  storage,
  fileFilter: createFilter(
    ['image/'],
    CLOUDINARY_CONFIG.ALLOWED_IMAGE_FORMATS,
    `Only images (${CLOUDINARY_CONFIG.ALLOWED_IMAGE_FORMATS.join(', ')}) are allowed.`
  ),
  limits: { fileSize: CLOUDINARY_CONFIG.MAX_FILE_SIZE }, // 10 MB max
}).single('image');

// Document Upload Middleware (Assignments, Reports, etc.)
export const uploadDocumentMiddleware = multer({
  storage,
  fileFilter: createFilter(
    ['application/', 'text/'],
    CLOUDINARY_CONFIG.ALLOWED_DOC_FORMATS,
    `Only documents (${CLOUDINARY_CONFIG.ALLOWED_DOC_FORMATS.join(', ')}) are allowed.`
  ),
  limits: { fileSize: CLOUDINARY_CONFIG.MAX_FILE_SIZE }, // 10 MB max
}).single('file');

// Generic Media Middleware (Images + Documents)
export const uploadMediaMiddleware = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    const isImage = CLOUDINARY_CONFIG.ALLOWED_IMAGE_FORMATS.includes(ext);
    const isDoc = CLOUDINARY_CONFIG.ALLOWED_DOC_FORMATS.includes(ext);

    if (isImage || isDoc) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and documents are allowed.'), false);
    }
  },
  limits: { fileSize: CLOUDINARY_CONFIG.MAX_FILE_SIZE }, // 10 MB max
}).single('media');
