import asyncHandler from 'express-async-handler';
import Question from '../models/Question.js';
import QuestionBank from '../models/QuestionBank.js';
import Exam from '../models/Exam.js';
import ExamResult from '../models/ExamResult.js';
import { logAction } from '../utils/auditLogger.js';

/**
 * Question Bank Controllers
 */

/**
 * Create a new question bank
 */
export const createQuestionBank = asyncHandler(async (req, res) => {
  const { name, description, subject, class: classId, tags, category } = req.body;
  
  const questionBank = await QuestionBank.create({
    name,
    description,
    subject,
    class: classId,
    tags,
    category,
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    createdBy: req.user._id
  });
  
  await logAction(req, {
    action: 'QUESTION_BANK_CREATED',
    module: 'EXAMS',
    targetId: questionBank._id,
    details: { name, subject, class: classId }
  });
  
  res.status(201).json({
    success: true,
    message: 'Question bank created successfully',
    questionBank
  });
});

/**
 * Get all question banks
 */
export const getQuestionBanks = asyncHandler(async (req, res) => {
  const { subject, class: classId, page = 1, limit = 20 } = req.query;
  
  const query = {
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  };
  
  if (subject) query.subject = subject;
  if (classId) query.class = classId;
  
  const questionBanks = await QuestionBank.find(query)
    .populate('subject', 'name')
    .populate('class', 'name')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  
  const total = await QuestionBank.countDocuments(query);
  
  res.json({
    success: true,
    questionBanks,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

/**
 * Get question bank by ID
 */
export const getQuestionBankById = asyncHandler(async (req, res) => {
  const questionBank = await QuestionBank.findOne({
    _id: req.params.id,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  })
    .populate('subject', 'name')
    .populate('class', 'name')
    .populate('createdBy', 'name');
  
  if (!questionBank) {
    return res.status(404).json({
      success: false,
      message: 'Question bank not found'
    });
  }
  
  res.json({
    success: true,
    questionBank
  });
});

/**
 * Update question bank
 */
export const updateQuestionBank = asyncHandler(async (req, res) => {
  const questionBank = await QuestionBank.findOne({
    _id: req.params.id,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  });
  
  if (!questionBank) {
    return res.status(404).json({
      success: false,
      message: 'Question bank not found'
    });
  }
  
  Object.assign(questionBank, req.body);
  questionBank.updatedBy = req.user._id;
  await questionBank.save();
  
  await logAction(req, {
    action: 'QUESTION_BANK_UPDATED',
    module: 'EXAMS',
    targetId: questionBank._id,
    details: { name: questionBank.name }
  });
  
  res.json({
    success: true,
    message: 'Question bank updated successfully',
    questionBank
  });
});

/**
 * Delete question bank (soft delete)
 */
export const deleteQuestionBank = asyncHandler(async (req, res) => {
  const questionBank = await QuestionBank.findOne({
    _id: req.params.id,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  });
  
  if (!questionBank) {
    return res.status(404).json({
      success: false,
      message: 'Question bank not found'
    });
  }
  
  questionBank.isDeleted = true;
  questionBank.deletedAt = new Date();
  questionBank.deletedBy = req.user._id;
  await questionBank.save();
  
  await logAction(req, {
    action: 'QUESTION_BANK_DELETED',
    module: 'EXAMS',
    targetId: questionBank._id,
    details: { name: questionBank.name }
  });
  
  res.json({
    success: true,
    message: 'Question bank deleted successfully'
  });
});

/**
 * Question Controllers
 */

/**
 * Create a new question
 */
export const createQuestion = asyncHandler(async (req, res) => {
  const {
    questionText,
    questionType,
    questionBank,
    subject,
    class: classId,
    options,
    correctAnswer,
    correctAnswerText,
    matchingPairs,
    blanks,
    difficulty,
    points,
    tags,
    topic,
    chapter,
    questionImage,
    questionAudio,
    questionVideo,
    explanation,
    timeLimit
  } = req.body;
  
  const question = await Question.create({
    questionText,
    questionType,
    questionBank,
    subject,
    class: classId,
    options,
    correctAnswer,
    correctAnswerText,
    matchingPairs,
    blanks,
    difficulty,
    points,
    tags,
    topic,
    chapter,
    questionImage,
    questionAudio,
    questionVideo,
    explanation,
    timeLimit,
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    createdBy: req.user._id
  });
  
  // Update question bank statistics
  const bank = await QuestionBank.findById(questionBank);
  if (bank) {
    await bank.updateStatistics();
  }
  
  await logAction(req, {
    action: 'QUESTION_CREATED',
    module: 'EXAMS',
    targetId: question._id,
    details: { questionType, questionBank, subject }
  });
  
  res.status(201).json({
    success: true,
    message: 'Question created successfully',
    question
  });
});

/**
 * Get all questions
 */
export const getQuestions = asyncHandler(async (req, res) => {
  const {
    questionBank,
    subject,
    class: classId,
    difficulty,
    questionType,
    page = 1,
    limit = 20
  } = req.query;
  
  const query = {
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  };
  
  if (questionBank) query.questionBank = questionBank;
  if (subject) query.subject = subject;
  if (classId) query.class = classId;
  if (difficulty) query.difficulty = difficulty;
  if (questionType) query.questionType = questionType;
  
  const questions = await Question.find(query)
    .populate('questionBank', 'name')
    .populate('subject', 'name')
    .populate('class', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  
  const total = await Question.countDocuments(query);
  
  res.json({
    success: true,
    questions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

/**
 * Get question by ID
 */
export const getQuestionById = asyncHandler(async (req, res) => {
  const question = await Question.findOne({
    _id: req.params.id,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  })
    .populate('questionBank', 'name')
    .populate('subject', 'name')
    .populate('class', 'name');
  
  if (!question) {
    return res.status(404).json({
      success: false,
      message: 'Question not found'
    });
  }
  
  res.json({
    success: true,
    question
  });
});

/**
 * Update question
 */
export const updateQuestion = asyncHandler(async (req, res) => {
  const question = await Question.findOne({
    _id: req.params.id,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  });
  
  if (!question) {
    return res.status(404).json({
      success: false,
      message: 'Question not found'
    });
  }
  
  Object.assign(question, req.body);
  question.updatedBy = req.user._id;
  await question.save();
  
  // Update question bank statistics
  if (question.questionBank) {
    const bank = await QuestionBank.findById(question.questionBank);
    if (bank) {
      await bank.updateStatistics();
    }
  }
  
  await logAction(req, {
    action: 'QUESTION_UPDATED',
    module: 'EXAMS',
    targetId: question._id,
    details: { questionType: question.questionType }
  });
  
  res.json({
    success: true,
    message: 'Question updated successfully',
    question
  });
});

/**
 * Delete question (soft delete)
 */
export const deleteQuestion = asyncHandler(async (req, res) => {
  const question = await Question.findOne({
    _id: req.params.id,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  });
  
  if (!question) {
    return res.status(404).json({
      success: false,
      message: 'Question not found'
    });
  }
  
  question.isDeleted = true;
  question.deletedAt = new Date();
  question.deletedBy = req.user._id;
  await question.save();
  
  // Update question bank statistics
  if (question.questionBank) {
    const bank = await QuestionBank.findById(question.questionBank);
    if (bank) {
      await bank.updateStatistics();
    }
  }
  
  await logAction(req, {
    action: 'QUESTION_DELETED',
    module: 'EXAMS',
    targetId: question._id,
    details: { questionType: question.questionType }
  });
  
  res.json({
    success: true,
    message: 'Question deleted successfully'
  });
});

/**
 * Exam Controllers
 */

/**
 * Create a new exam
 */
export const createExam = asyncHandler(async (req, res) => {
  const {
    name,
    term,
    date,
    class: classId,
    subject,
    maxMarks,
    examType,
    questionBank,
    questions,
    questionSelectionMode,
    startTime,
    endTime,
    duration,
    passingScore,
    allowRetake,
    maxAttempts,
    requireProctoring,
    shuffleQuestions,
    shuffleOptions,
    showResultsImmediately,
    showCorrectAnswers,
    password,
    allowedIPs,
    instructions
  } = req.body;
  
  const exam = await Exam.create({
    name,
    term,
    date,
    class: classId,
    subject,
    maxMarks,
    examType,
    questionBank,
    questions,
    questionSelectionMode,
    startTime,
    endTime,
    duration,
    passingScore,
    allowRetake,
    maxAttempts,
    requireProctoring,
    shuffleQuestions,
    shuffleOptions,
    showResultsImmediately,
    showCorrectAnswers,
    password,
    allowedIPs,
    instructions,
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    createdBy: req.user._id
  });
  
  await logAction(req, {
    action: 'EXAM_CREATED',
    module: 'EXAMS',
    targetId: exam._id,
    details: { name, examType, subject, class: classId }
  });
  
  res.status(201).json({
    success: true,
    message: 'Exam created successfully',
    exam
  });
});

/**
 * Get all exams
 */
export const getExams = asyncHandler(async (req, res) => {
  const {
    class: classId,
    subject,
    examType,
    status,
    page = 1,
    limit = 20
  } = req.query;
  
  const query = {
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  };
  
  if (classId) query.class = classId;
  if (subject) query.subject = subject;
  if (examType) query.examType = examType;
  if (status) query.status = status;
  
  const exams = await Exam.find(query)
    .populate('class', 'name')
    .populate('subject', 'name')
    .populate('questionBank', 'name')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  
  const total = await Exam.countDocuments(query);
  
  res.json({
    success: true,
    exams,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

/**
 * Get exam by ID
 */
export const getExamById = asyncHandler(async (req, res) => {
  const exam = await Exam.findOne({
    _id: req.params.id,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  })
    .populate('class', 'name')
    .populate('subject', 'name')
    .populate('questionBank', 'name')
    .populate('questions')
    .populate('createdBy', 'name');
  
  if (!exam) {
    return res.status(404).json({
      success: false,
      message: 'Exam not found'
    });
  }
  
  res.json({
    success: true,
    exam
  });
});

/**
 * Update exam
 */
export const updateExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findOne({
    _id: req.params.id,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  });
  
  if (!exam) {
    return res.status(404).json({
      success: false,
      message: 'Exam not found'
    });
  }
  
  Object.assign(exam, req.body);
  exam.updatedBy = req.user._id;
  await exam.save();
  
  await logAction(req, {
    action: 'EXAM_UPDATED',
    module: 'EXAMS',
    targetId: exam._id,
    details: { name: exam.name }
  });
  
  res.json({
    success: true,
    message: 'Exam updated successfully',
    exam
  });
});

/**
 * Delete exam (soft delete)
 */
export const deleteExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findOne({
    _id: req.params.id,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  });
  
  if (!exam) {
    return res.status(404).json({
      success: false,
      message: 'Exam not found'
    });
  }
  
  exam.isDeleted = true;
  exam.deletedAt = new Date();
  exam.deletedBy = req.user._id;
  await exam.save();
  
  await logAction(req, {
    action: 'EXAM_DELETED',
    module: 'EXAMS',
    targetId: exam._id,
    details: { name: exam.name }
  });
  
  res.json({
    success: true,
    message: 'Exam deleted successfully'
  });
});

/**
 * Start exam for student
 */
export const startExam = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const { studentId } = req.body;
  
  const exam = await Exam.findOne({
    _id: examId,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  });
  
  if (!exam) {
    return res.status(404).json({
      success: false,
      message: 'Exam not found'
    });
  }
  
  if (!exam.canTakeExam()) {
    return res.status(400).json({
      success: false,
      message: 'Exam cannot be taken at this time'
    });
  }
  
  // Check if student already has an attempt in progress
  const existingResult = await ExamResult.findOne({
    exam: examId,
    student: studentId,
    status: 'IN_PROGRESS'
  });
  
  if (existingResult) {
    return res.status(400).json({
      success: false,
      message: 'Exam already in progress'
    });
  }
  
  // Get questions based on selection mode
  let examQuestions = [];
  if (exam.questionSelectionMode === 'MANUAL' && exam.questions.length > 0) {
    examQuestions = exam.questions;
  } else if (exam.questionBank) {
    // Random selection from question bank
    const bankQuestions = await Question.find({
      questionBank: exam.questionBank,
      isDeleted: false
    }).limit(exam.questions.length || 20);
    examQuestions = bankQuestions.map(q => q._id);
  }
  
  // Calculate attempt number
  const previousAttempts = await ExamResult.countDocuments({
    exam: examId,
    student: studentId,
    status: { $in: ['SUBMITTED', 'GRADED'] }
  });
  
  const examResult = await ExamResult.create({
    exam: examId,
    student: studentId,
    class: exam.class,
    subject: exam.subject,
    status: 'IN_PROGRESS',
    totalQuestions: examQuestions.length,
    maxScore: exam.maxMarks,
    attemptNumber: previousAttempts + 1,
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    createdBy: req.user._id
  });
  
  await examResult.startExam();
  
  await logAction(req, {
    action: 'EXAM_STARTED',
    module: 'EXAMS',
    targetId: examResult._id,
    details: { examId, studentId, attemptNumber: examResult.attemptNumber }
  });
  
  res.json({
    success: true,
    message: 'Exam started successfully',
    examResult,
    questions: examQuestions
  });
});

/**
 * Submit exam
 */
export const submitExam = asyncHandler(async (req, res) => {
  const { examResultId } = req.params;
  const { responses } = req.body;
  
  const examResult = await ExamResult.findOne({
    _id: examResultId,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  }).populate('exam');
  
  if (!examResult) {
    return res.status(404).json({
      success: false,
      message: 'Exam result not found'
    });
  }
  
  if (examResult.status !== 'IN_PROGRESS') {
    return res.status(400).json({
      success: false,
      message: 'Exam is not in progress'
    });
  }
  
  // Validate and grade responses
  const gradedResponses = [];
  for (const response of responses) {
    const question = await Question.findById(response.question);
    if (question) {
      const isCorrect = question.validateAnswer(response.answer);
      gradedResponses.push({
        question: response.question,
        answer: response.answer,
        isCorrect,
        isSkipped: response.isSkipped || false,
        timeSpent: response.timeSpent || 0,
        points: isCorrect ? question.points : 0
      });
    }
  }
  
  examResult.responses = gradedResponses;
  await examResult.submitExam();
  
  await logAction(req, {
    action: 'EXAM_SUBMITTED',
    module: 'EXAMS',
    targetId: examResult._id,
    details: {
      examId: examResult.exam,
      studentId: examResult.student,
      score: examResult.score,
      percentage: examResult.percentage
    }
  });
  
  res.json({
    success: true,
    message: 'Exam submitted successfully',
    examResult
  });
});

/**
 * Get exam results
 */
export const getExamResults = asyncHandler(async (req, res) => {
  const { examId, studentId, status, page = 1, limit = 20 } = req.query;
  
  const query = {
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  };
  
  if (examId) query.exam = examId;
  if (studentId) query.student = studentId;
  if (status) query.status = status;
  
  const examResults = await ExamResult.find(query)
    .populate('exam', 'name')
    .populate('student', 'name customId')
    .populate('class', 'name')
    .populate('subject', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  
  const total = await ExamResult.countDocuments(query);
  
  res.json({
    success: true,
    examResults,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

/**
 * Get exam result by ID
 */
export const getExamResultById = asyncHandler(async (req, res) => {
  const examResult = await ExamResult.findOne({
    _id: req.params.id,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  })
    .populate('exam', 'name')
    .populate('student', 'name customId')
    .populate('class', 'name')
    .populate('subject', 'name')
    .populate('responses.question');
  
  if (!examResult) {
    return res.status(404).json({
      success: false,
      message: 'Exam result not found'
    });
  }
  
  res.json({
    success: true,
    examResult
  });
});

/**
 * Grade exam (for manual grading)
 */
export const gradeExam = asyncHandler(async (req, res) => {
  const { examResultId } = req.params;
  const { score, grade, gradingNotes, feedback } = req.body;
  
  const examResult = await ExamResult.findOne({
    _id: examResultId,
    school: req.schoolId,
    branch: req.branchId,
    isDeleted: false
  });
  
  if (!examResult) {
    return res.status(404).json({
      success: false,
      message: 'Exam result not found'
    });
  }
  
  examResult.score = score;
  examResult.grade = grade;
  examResult.gradingNotes = gradingNotes;
  examResult.feedback = feedback;
  examResult.status = 'GRADED';
  examResult.gradedBy = req.user._id;
  examResult.gradedAt = new Date();
  examResult.percentage = examResult.maxScore > 0 ? (score / examResult.maxScore) * 100 : 0;
  
  await examResult.save();
  
  await logAction(req, {
    action: 'EXAM_GRADED',
    module: 'EXAMS',
    targetId: examResult._id,
    details: { score, grade }
  });
  
  res.json({
    success: true,
    message: 'Exam graded successfully',
    examResult
  });
});

export default {
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
};
