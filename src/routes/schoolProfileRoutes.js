import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { checkProfileStatus, completeSchoolProfile } from '../controllers/schoolProfileController.js';

const router = express.Router();

// Both routes require authentication
router.use(protect);

router.get('/school-profile-status', checkProfileStatus);
router.post('/complete-school-profile', completeSchoolProfile);

export default router;
