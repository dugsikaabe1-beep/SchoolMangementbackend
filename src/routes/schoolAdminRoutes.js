import express from 'express';
import {
  schoolAdminLogin,
  completeSchoolProfile,
  getSchoolProfile,
  updateSchoolProfile,
  checkProfileStatus,
  updateOnboarding,
  getEnabledFeatures
} from '../controllers/schoolAdminController.js';
import { createTicket, getTickets, respondToTicket } from '../controllers/supportController.js';
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
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { injectOwnership, injectBranch } from '../middlewares/tenantMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';

const router = express.Router();

// Public routes
router.post('/login', asyncHandler(schoolAdminLogin));

// Protected routes (School Admin only)
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(asyncHandler(injectAcademicYear));
router.use(injectOwnership);

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
router.get('/profile-status', asyncHandler(checkProfileStatus));
router.get('/enabled-features', asyncHandler(getEnabledFeatures));
router.get('/school-profile', asyncHandler(getSchoolProfile));
router.post('/complete-profile', asyncHandler(completeSchoolProfile));
router.put('/school-profile', asyncHandler(updateSchoolProfile));
router.put('/onboarding', asyncHandler(updateOnboarding));

// Public Content Management
router.use('/public-content', checkModuleAccess('website'));
router.put('/public-content/home', asyncHandler(updateHomeContent));
router.put('/public-content/about', asyncHandler(updateAboutContent));
router.post('/public-content/events', asyncHandler(createEvent));
router.put('/public-content/events/:id', asyncHandler(updateEvent));
router.delete('/public-content/events/:id', asyncHandler(deleteEvent));
router.post('/upload', uploadImageMiddleware, asyncHandler(uploadFile));

// Exam Hall Routes
router.use('/exam-halls', checkModuleAccess('exam-halls'));
router.get('/exam-halls', asyncHandler(getExamHalls));
router.get('/exam-halls/:id', asyncHandler(getExamHallById));
router.get('/exam-halls/available-students', asyncHandler(getAvailableStudentsForHall));
router.post('/exam-halls', asyncHandler(createExamHall));
router.put('/exam-halls/:id', asyncHandler(updateExamHall));
router.delete('/exam-halls/:id', asyncHandler(deleteExamHall));
router.post('/exam-halls/:id/assign-student', asyncHandler(assignStudentToHall));
router.delete('/exam-halls/:id/students/:studentId', asyncHandler(removeStudentFromHall));
router.post('/exam-halls/temporary-clearance', asyncHandler(grantTemporaryClearance));
router.delete('/exam-halls/revoke-clearance', asyncHandler(revokeTemporaryClearance));

// Support Ticket Routes
router.get('/tickets', asyncHandler(getTickets));
router.post('/tickets', asyncHandler(createTicket));
router.post('/tickets/:id/respond', asyncHandler(respondToTicket));

export default router;
