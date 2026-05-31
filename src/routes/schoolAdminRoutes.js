import express from 'express';
import {
  schoolAdminLogin,
  completeSchoolProfile,
  getSchoolProfile,
  updateSchoolProfile,
  checkProfileStatus
} from '../controllers/schoolAdminController.js';
import {
  updateHomeContent,
  updateAboutContent,
  createEvent,
  updateEvent,
  deleteEvent
} from '../controllers/publicContentController.js';
import {
  getExamHalls,
  getExamHallById,
  createExamHall,
  updateExamHall,
  deleteExamHall,
  assignStudentToHall,
  removeStudentFromHall,
  getAvailableStudentsForHall,
  grantTemporaryClearance,
  revokeTemporaryClearance
} from '../controllers/examHallController.js';
import { uploadFile } from '../controllers/uploadController.js';
import { uploadImageMiddleware } from '../middlewares/uploadMiddleware.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/login', schoolAdminLogin);

// Protected routes (School Admin only)
router.use(protect);

// Middleware to ensure only School Admin can access
router.use((req, res, next) => {
  if (req.user?.role !== 'schooladmin') {
    return res.status(403).json({
      message: 'Access denied',
      userMessage: 'Only school admins can access this resource.'
    });
  }
  next();
});

// Profile routes
router.get('/profile-status', checkProfileStatus);
router.get('/school-profile', getSchoolProfile);
router.post('/complete-profile', completeSchoolProfile);
router.put('/school-profile', updateSchoolProfile);

// Public Content Management
router.put('/public-content/home', updateHomeContent);
router.put('/public-content/about', updateAboutContent);
router.post('/public-content/events', createEvent);
router.put('/public-content/events/:id', updateEvent);
router.delete('/public-content/events/:id', deleteEvent);
router.post('/upload', uploadImageMiddleware, uploadFile);

// Exam Hall Routes
router.get('/exam-halls', getExamHalls);
router.get('/exam-halls/:id', getExamHallById);
router.get('/exam-halls/available-students', getAvailableStudentsForHall);
router.post('/exam-halls', createExamHall);
router.put('/exam-halls/:id', updateExamHall);
router.delete('/exam-halls/:id', deleteExamHall);
router.post('/exam-halls/:id/assign-student', assignStudentToHall);
router.delete('/exam-halls/:id/students/:studentId', removeStudentFromHall);
router.post('/exam-halls/temporary-clearance', grantTemporaryClearance);
router.post('/exam-halls/revoke-clearance', revokeTemporaryClearance);

export default router;
