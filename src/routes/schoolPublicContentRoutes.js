import express from 'express';
import { 
  updateHomeContent, 
  updateAboutContent, 
  createEvent, 
  updateEvent, 
  deleteEvent 
} from '../controllers/publicContentController.js';
import { uploadFile } from '../controllers/uploadController.js';
import { uploadImageMiddleware } from '../middlewares/uploadMiddleware.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Protected routes (School Admin only)
router.use(protect);
router.use(authorize('schooladmin', 'admin', 'school_admin'));

// Image upload
router.post('/upload', uploadImageMiddleware, uploadFile);

// Home content management
router.put('/home', updateHomeContent);

// About content management
router.put('/about', updateAboutContent);

// Events management
router.post('/events', createEvent);
router.put('/events/:id', updateEvent);
router.delete('/events/:id', deleteEvent);

export default router;
