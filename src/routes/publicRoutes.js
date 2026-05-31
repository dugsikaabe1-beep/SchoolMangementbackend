import express from 'express';
import { getSchools, getPublicContent, getPublicEvents } from '../controllers/publicContentController.js';

const router = express.Router();

// Publicly accessible routes
router.get('/schools', getSchools);
router.get('/content/:schoolId?', getPublicContent);
router.get('/events/:schoolId?', getPublicEvents);

export default router;
