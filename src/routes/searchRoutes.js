import express from 'express';
import { globalSearch } from '../controllers/searchController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(branchIsolation);

router.get('/global', globalSearch);

export default router;
