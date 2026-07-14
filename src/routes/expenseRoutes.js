import express from 'express';
import { protect, allowAdmin } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { injectBranch } from '../middlewares/tenantMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats,
} from '../controllers/expenseController.js';

const router = express.Router();

router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(asyncHandler(injectAcademicYear));

router.get('/stats', asyncHandler(getExpenseStats));
router.route('/')
  .get(asyncHandler(getExpenses))
  .post(asyncHandler(allowAdmin), asyncHandler(createExpense));

router.route('/:id')
  .put(asyncHandler(allowAdmin), asyncHandler(updateExpense))
  .delete(asyncHandler(allowAdmin), asyncHandler(deleteExpense));

export default router;
