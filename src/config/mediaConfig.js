/** Max upload size per file (10 MB) */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Root folder on Cloudinary */
export const CLOUDINARY_ROOT = process.env.CLOUDINARY_ROOT_FOLDER || 'dugsihub';

/** Allowed upload categories → subfolder name */
export const UPLOAD_CATEGORIES = {
  students: 'students',
  teachers: 'teachers',
  logos: 'logos',
  banners: 'banners',
  events: 'events',
  announcements: 'announcements',
  assignments: 'assignments',
  reports: 'reports',
  documents: 'documents',
  general: 'general',
};

export const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'msi',
  'dll',
  'scr',
  'sh',
  'bash',
  'php',
  'phtml',
  'js',
  'mjs',
  'cjs',
  'html',
  'htm',
  'svg',
  'jar',
  'vbs',
  'ps1',
  'apk',
  'deb',
  'rpm',
]);

export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
export const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx']);
