import express from 'express';
import { getOnboardingStatus, completeOnboardingStep } from '../controllers/onboardingController.js';
import { protect, allowAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(allowAdmin);

router.get('/status', getOnboardingStatus);
router.post('/step/:stepName', completeOnboardingStep);

export default router;
