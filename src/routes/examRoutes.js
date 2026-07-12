import express from 'express';
import {
  // Question Bank
  createQuestionBank,
  getQuestionBanks,
  getQuestionBankById,
  updateQuestionBank,
  deleteQuestionBank,
  // Questions
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  // Exams
  createExam,
  getExams,
  getExamById,
  updateExam,
  deleteExam,
  startExam,
  submitExam,
  // Exam Results
  getExamResults,
  getExamResultById,
  gradeExam
} from '../controllers/examController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const router = express.Router();

// Question Bank Routes
router.post('/question-banks', protect, asyncHandler(createQuestionBank));
router.get('/question-banks', protect, asyncHandler(getQuestionBanks));
router.get('/question-banks/:id', protect, asyncHandler(getQuestionBankById));
router.put('/question-banks/:id', protect, asyncHandler(updateQuestionBank));
router.delete('/question-banks/:id', protect, asyncHandler(deleteQuestionBank));

// Question Routes
router.post('/questions', protect, asyncHandler(createQuestion));
router.get('/questions', protect, asyncHandler(getQuestions));
router.get('/questions/:id', protect, asyncHandler(getQuestionById));
router.put('/questions/:id', protect, asyncHandler(updateQuestion));
router.delete('/questions/:id', protect, asyncHandler(deleteQuestion));

// Exam Routes
router.post('/exams', protect, asyncHandler(createExam));
router.get('/exams', protect, asyncHandler(getExams));
router.get('/exams/:id', protect, asyncHandler(getExamById));
router.put('/exams/:id', protect, asyncHandler(updateExam));
router.delete('/exams/:id', protect, asyncHandler(deleteExam));

// Exam Taking Routes
router.post('/exams/:examId/start', protect, asyncHandler(startExam));
router.post('/exam-results/:examResultId/submit', protect, asyncHandler(submitExam));

// Exam Result Routes
router.get('/exam-results', protect, asyncHandler(getExamResults));
router.get('/exam-results/:id', protect, asyncHandler(getExamResultById));
router.post('/exam-results/:examResultId/grade', protect, asyncHandler(gradeExam));

export default router;
