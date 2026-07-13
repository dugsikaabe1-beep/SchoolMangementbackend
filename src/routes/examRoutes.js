import express from 'express';
import {
  createQuestionBank,
  getQuestionBanks,
  getQuestionBankById,
  updateQuestionBank,
  deleteQuestionBank,
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  createExam,
  getExams,
  getExamById,
  updateExam,
  deleteExam,
  startExam,
  submitExam,
  getExamResults,
  getExamResultById,
  gradeExam,
  bulkCreateQuestions,
  exportQuestions,
  cloneQuestionBank,
  submitBankForApproval,
  approveQuestionBank,
  publishExam,
  getExamAnalytics,
  getExamRankings,
  calculateStudentGPA,
  calculateStudentCGPA,
  publishExamResults,
  bulkGradeExams,
  restoreQuestion,
  archiveQuestion,
  importQuestionsFromCSV,
  getMeritList
} from '../controllers/examController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const router = express.Router();

// Question Bank Routes
router.post('/question-banks', protect, asyncHandler(createQuestionBank));
router.get('/question-banks', protect, asyncHandler(getQuestionBanks));
router.get('/question-banks/export', protect, asyncHandler(exportQuestions));
router.get('/question-banks/:id', protect, asyncHandler(getQuestionBankById));
router.put('/question-banks/:id', protect, asyncHandler(updateQuestionBank));
router.delete('/question-banks/:id', protect, asyncHandler(deleteQuestionBank));
router.post('/question-banks/:id/clone', protect, asyncHandler(cloneQuestionBank));
router.post('/question-banks/:id/submit-approval', protect, asyncHandler(submitBankForApproval));
router.post('/question-banks/:id/approve', protect, asyncHandler(approveQuestionBank));

// Question Routes
router.post('/questions', protect, asyncHandler(createQuestion));
router.get('/questions', protect, asyncHandler(getQuestions));
router.get('/questions/export', protect, asyncHandler(exportQuestions));
router.post('/questions/bulk', protect, asyncHandler(bulkCreateQuestions));
router.get('/questions/:id', protect, asyncHandler(getQuestionById));
router.put('/questions/:id', protect, asyncHandler(updateQuestion));
router.delete('/questions/:id', protect, asyncHandler(deleteQuestion));
router.put('/questions/:questionId/restore', protect, asyncHandler(restoreQuestion));
router.put('/questions/:questionId/archive', protect, asyncHandler(archiveQuestion));
router.post('/questions/import', protect, asyncHandler(importQuestionsFromCSV));

// Exam Routes
router.post('/exams', protect, asyncHandler(createExam));
router.get('/exams', protect, asyncHandler(getExams));
router.get('/exams/:id', protect, asyncHandler(getExamById));
router.put('/exams/:id', protect, asyncHandler(updateExam));
router.delete('/exams/:id', protect, asyncHandler(deleteExam));
router.post('/exams/:id/publish', protect, asyncHandler(publishExam));

// Exam Taking Routes
router.post('/exams/:examId/start', protect, asyncHandler(startExam));
router.post('/exam-results/:examResultId/submit', protect, asyncHandler(submitExam));

// Exam Result Routes
router.get('/exam-results', protect, asyncHandler(getExamResults));
router.get('/exam-results/:id', protect, asyncHandler(getExamResultById));
router.post('/exam-results/:examResultId/grade', protect, asyncHandler(gradeExam));
router.post('/exam-results/bulk-grade', protect, asyncHandler(bulkGradeExams));
router.post('/exam-results/:examId/publish', protect, asyncHandler(publishExamResults));

// Merit List
router.get('/exam-results/merit-list', protect, asyncHandler(getMeritList));

// Analytics & Rankings
router.get('/exams/:examId/analytics', protect, asyncHandler(getExamAnalytics));
router.get('/exams/:examId/rankings', protect, asyncHandler(getExamRankings));

// GPA & CGPA
router.get('/students/:studentId/gpa', protect, asyncHandler(calculateStudentGPA));
router.get('/students/:studentId/cgpa', protect, asyncHandler(calculateStudentCGPA));

export default router;
