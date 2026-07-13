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

/**
 * Bulk create questions from JSON array
 */
export const bulkCreateQuestions = asyncHandler(async (req, res) => {
  const { questions } = req.body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ success: false, message: 'Questions array is required' });
  }

  const created = [];
  const errors = [];

  for (let i = 0; i < questions.length; i++) {
    try {
      const q = questions[i];
      const question = await Question.create({
        ...q,
        school: req.schoolId,
        branch: req.branchId,
        academicYear: req.academicYearId,
        createdBy: req.user._id
      });
      created.push(question);

      if (q.questionBank) {
        const bank = await QuestionBank.findById(q.questionBank);
        if (bank) await bank.updateStatistics();
      }
    } catch (err) {
      errors.push({ index: i, error: err.message, question: questions[i]?.questionText });
    }
  }

  await logAction(req, {
    action: 'QUESTIONS_BULK_CREATED',
    module: 'EXAMS',
    details: { total: questions.length, created: created.length, errors: errors.length }
  });

  res.status(201).json({
    success: true,
    message: `${created.length} questions created, ${errors.length} errors`,
    created: created.length,
    errors
  });
});

/**
 * Export questions as JSON
 */
export const exportQuestions = asyncHandler(async (req, res) => {
  const { questionBank, subject, class: classId, difficulty, questionType, format = 'json' } = req.query;

  const query = { school: req.schoolId, branch: req.branchId, isDeleted: false };
  if (questionBank) query.questionBank = questionBank;
  if (subject) query.subject = subject;
  if (classId) query.class = classId;
  if (difficulty) query.difficulty = difficulty;
  if (questionType) query.questionType = questionType;

  const questions = await Question.find(query)
    .populate('subject', 'name')
    .populate('class', 'name')
    .populate('questionBank', 'name')
    .sort({ createdAt: -1 });

  if (format === 'csv') {
    const headers = ['questionText', 'questionType', 'difficulty', 'points', 'topic', 'chapter', 'tags'];
    const rows = questions.map(q => headers.map(h => {
      const val = h === 'tags' ? (q[h] || []).join(';') : q[h];
      return `"${String(val || '').replace(/"/g, '""')}"`;
    }).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=questions_export.csv');
    return res.send(csv);
  }

  res.json({ success: true, questions, total: questions.length });
});

/**
 * Clone a question bank with all its questions
 */
export const cloneQuestionBank = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  const sourceBank = await QuestionBank.findOne({
    _id: id, school: req.schoolId, branch: req.branchId, isDeleted: false
  });
  if (!sourceBank) {
    return res.status(404).json({ success: false, message: 'Question bank not found' });
  }

  const newBank = await QuestionBank.create({
    name: name || `${sourceBank.name} (Copy)`,
    description: sourceBank.description,
    subject: sourceBank.subject,
    class: sourceBank.class,
    tags: sourceBank.tags,
    category: sourceBank.category,
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYearId,
    createdBy: req.user._id
  });

  const sourceQuestions = await Question.find({
    questionBank: id, school: req.schoolId, branch: req.branchId, isDeleted: false
  });

  const clonedQuestions = [];
  for (const sq of sourceQuestions) {
    const qData = sq.toObject();
    delete qData._id;
    delete qData.createdAt;
    delete qData.updatedAt;
    delete qData.versionHistory;
    delete qData.usageStatistics;
    const cloned = await Question.create({
      ...qData,
      questionBank: newBank._id,
      version: 1,
      approvalStatus: 'DRAFT',
      school: req.schoolId,
      branch: req.branchId,
      academicYear: req.academicYearId,
      createdBy: req.user._id
    });
    clonedQuestions.push(cloned);
  }

  await newBank.updateStatistics();

  await logAction(req, {
    action: 'QUESTION_BANK_CLONED',
    module: 'EXAMS',
    targetId: newBank._id,
    details: { sourceBankId: id, questionsCloned: clonedQuestions.length }
  });

  res.status(201).json({ success: true, message: 'Question bank cloned', questionBank: newBank, questionsCloned: clonedQuestions.length });
});

/**
 * Submit question bank for approval
 */
export const submitBankForApproval = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const bank = await QuestionBank.findOne({
    _id: id, school: req.schoolId, branch: req.branchId, isDeleted: false
  });
  if (!bank) return res.status(404).json({ success: false, message: 'Question bank not found' });

  bank.approvalStatus = 'PENDING_REVIEW';
  bank.submittedForReview = new Date();
  await bank.save();

  await logAction(req, {
    action: 'BANK_SUBMITTED_FOR_APPROVAL',
    module: 'EXAMS',
    targetId: bank._id,
    details: { bankName: bank.name }
  });

  res.json({ success: true, message: 'Submitted for approval', questionBank: bank });
});

/**
 * Approve or reject a question bank
 */
export const approveQuestionBank = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be APPROVED or REJECTED' });
  }

  const bank = await QuestionBank.findOne({
    _id: id, school: req.schoolId, branch: req.branchId, isDeleted: false
  });
  if (!bank) return res.status(404).json({ success: false, message: 'Question bank not found' });

  bank.approvalStatus = status;
  bank.reviewedBy = req.user._id;
  bank.reviewedAt = new Date();
  if (status === 'REJECTED') bank.rejectionReason = rejectionReason;
  if (status === 'APPROVED') {
    bank.approvedBy = req.user._id;
    bank.approvedAt = new Date();
  }
  await bank.save();

  await logAction(req, {
    action: `BANK_${status}`,
    module: 'EXAMS',
    targetId: bank._id,
    details: { bankName: bank.name, rejectionReason }
  });

  res.json({ success: true, message: `Question bank ${status.toLowerCase()}`, questionBank: bank });
});

/**
 * Publish an exam
 */
export const publishExam = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const exam = await Exam.findOne({
    _id: id, school: req.schoolId, branch: req.branchId, isDeleted: false
  });
  if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

  if (exam.status === 'Published') {
    return res.status(400).json({ success: false, message: 'Exam is already published' });
  }

  if (!exam.questions || exam.questions.length === 0) {
    return res.status(400).json({ success: false, message: 'Cannot publish exam with no questions' });
  }

  exam.status = 'Published';
  exam.publishedBy = req.user._id;
  exam.publishedAt = new Date();
  await exam.save();

  await logAction(req, {
    action: 'EXAM_PUBLISHED',
    module: 'EXAMS',
    targetId: exam._id,
    details: { examName: exam.name }
  });

  res.json({ success: true, message: 'Exam published', exam });
});

/**
 * Get exam analytics
 */
export const getExamAnalytics = asyncHandler(async (req, res) => {
  const { examId } = req.params;

  const exam = await Exam.findOne({
    _id: examId, school: req.schoolId, branch: req.branchId, isDeleted: false
  });
  if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

  const results = await ExamResult.find({
    exam: examId, school: req.schoolId, branch: req.branchId, isDeleted: false
  }).select('score maxScore percentage grade correctAnswers wrongAnswers skippedQuestions timeTaken status responses');

  const graded = results.filter(r => ['GRADED', 'SUBMITTED'].includes(r.status));
  const total = graded.length;
  if (total === 0) {
    return res.json({
      success: true,
      analytics: {
        totalStudents: 0, averageScore: 0, medianScore: 0, highestScore: 0,
        lowestScore: 0, passRate: 0, gradeDistribution: {}, difficultyAnalysis: []
      }
    });
  }

  const scores = graded.map(r => r.percentage).sort((a, b) => a - b);
  const averageScore = scores.reduce((a, b) => a + b, 0) / total;
  const medianScore = total % 2 === 0 ? (scores[total / 2 - 1] + scores[total / 2]) / 2 : scores[Math.floor(total / 2)];
  const passed = graded.filter(r => exam.passingPercentage ? r.percentage >= exam.passingPercentage : r.percentage >= 50).length;

  const gradeDistribution = {};
  graded.forEach(r => {
    gradeDistribution[r.grade] = (gradeDistribution[r.grade] || 0) + 1;
  });

  const questionAnalysis = {};
  for (const r of graded) {
    for (const resp of r.responses) {
      const qId = resp.question?.toString();
      if (!qId) continue;
      if (!questionAnalysis[qId]) questionAnalysis[qId] = { total: 0, correct: 0, avgTime: 0, totalTime: 0 };
      questionAnalysis[qId].total++;
      if (resp.isCorrect) questionAnalysis[qId].correct++;
      questionAnalysis[qId].totalTime += resp.timeSpent || 0;
    }
  }

  const difficultyAnalysis = Object.entries(questionAnalysis).map(([qId, data]) => ({
    questionId: qId,
    totalAttempts: data.total,
    correctRate: data.total > 0 ? (data.correct / data.total * 100).toFixed(1) : 0,
    averageTime: data.total > 0 ? (data.totalTime / data.total).toFixed(1) : 0
  }));

  res.json({
    success: true,
    analytics: {
      examName: exam.name,
      totalStudents: total,
      averageScore: averageScore.toFixed(1),
      medianScore: medianScore.toFixed(1),
      highestScore: scores[scores.length - 1],
      lowestScore: scores[0],
      passRate: ((passed / total) * 100).toFixed(1),
      gradeDistribution,
      difficultyAnalysis,
      responseRate: ((total / (exam.totalRegistered || total)) * 100).toFixed(1)
    }
  });
});

/**
 * Get class rankings for an exam
 */
export const getExamRankings = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const { classId, page = 1, limit = 50 } = req.query;

  const query = {
    exam: examId, school: req.schoolId, branch: req.branchId, isDeleted: false,
    status: { $in: ['GRADED', 'SUBMITTED'] }
  };
  if (classId) query.class = classId;

  const results = await ExamResult.find(query)
    .populate('student', 'name customId')
    .populate('class', 'name')
    .sort({ percentage: -1, timeTaken: 1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await ExamResult.countDocuments(query);

  const ranked = results.map((r, idx) => ({
    rank: (page - 1) * limit + idx + 1,
    student: r.student,
    class: r.class,
    score: r.score,
    maxScore: r.maxScore,
    percentage: r.percentage,
    grade: r.grade,
    gpa: r.gpa,
    timeTaken: r.timeTaken,
    correctAnswers: r.correctAnswers,
    wrongAnswers: r.wrongAnswers,
    status: r.status
  }));

  res.json({
    success: true,
    rankings: ranked,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
  });
});

/**
 * Calculate GPA for a student
 */
export const calculateStudentGPA = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { term, academicYearId } = req.query;

  const query = {
    student: studentId, school: req.schoolId, branch: req.branchId, isDeleted: false,
    status: { $in: ['GRADED', 'SUBMITTED'] }
  };
  if (academicYearId) query.academicYear = academicYearId;

  const results = await ExamResult.find(query)
    .populate('exam', 'name term maxMarks')
    .populate('subject', 'name');

  const termResults = term ? results.filter(r => r.exam?.term === term) : results;

  if (termResults.length === 0) {
    return res.json({ success: true, gpa: 0, totalCredits: 0, subjects: [] });
  }

  let totalWeightedGPA = 0;
  let totalCredits = 0;

  const subjectMap = {};
  for (const r of termResults) {
    const subId = r.subject?._id?.toString() || r.subject?.toString();
    if (!subId) continue;
    if (!subjectMap[subId]) subjectMap[subId] = { subject: r.subject, scores: [], gpa: 0, credits: 0 };
    subjectMap[subId].scores.push(r.percentage);
  }

  const subjects = Object.values(subjectMap).map(s => {
    const avgPercentage = s.scores.reduce((a, b) => a + b, 0) / s.scores.length;
    const exam = termResults.find(r => r.subject?._id?.toString() === s.subject?._id?.toString())?.exam;
    const maxMarks = exam?.maxMarks || 100;
    const credits = maxMarks / 10;
    let gpaPoints = 0;
    if (avgPercentage >= 90) gpaPoints = 4.0;
    else if (avgPercentage >= 80) gpaPoints = 3.0;
    else if (avgPercentage >= 70) gpaPoints = 2.0;
    else if (avgPercentage >= 60) gpaPoints = 1.0;

    totalWeightedGPA += gpaPoints * credits;
    totalCredits += credits;

    return { subject: s.subject, averageScore: avgPercentage.toFixed(1), gpa: gpaPoints, credits };
  });

  const gpa = totalCredits > 0 ? (totalWeightedGPA / totalCredits).toFixed(2) : 0;

  res.json({ success: true, gpa: parseFloat(gpa), totalCredits, subjects });
});

/**
 * Calculate CGPA for a student across all terms
 */
export const calculateStudentCGPA = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { academicYearId } = req.query;

  const query = {
    student: studentId, school: req.schoolId, branch: req.branchId, isDeleted: false,
    status: { $in: ['GRADED', 'SUBMITTED'] }
  };
  if (academicYearId) query.academicYear = academicYearId;

  const results = await ExamResult.find(query).populate('exam', 'name term maxMarks');

  if (results.length === 0) {
    return res.json({ success: true, cgpa: 0, terms: [] });
  }

  const termMap = {};
  for (const r of results) {
    const term = r.exam?.term || 'Unknown';
    if (!termMap[term]) termMap[term] = { term, totalWeightedGPA: 0, totalCredits: 0, exams: 0 };
    const maxMarks = r.exam?.maxMarks || 100;
    const credits = maxMarks / 10;
    let gpaPoints = 0;
    if (r.percentage >= 90) gpaPoints = 4.0;
    else if (r.percentage >= 80) gpaPoints = 3.0;
    else if (r.percentage >= 70) gpaPoints = 2.0;
    else if (r.percentage >= 60) gpaPoints = 1.0;
    termMap[term].totalWeightedGPA += gpaPoints * credits;
    termMap[term].totalCredits += credits;
    termMap[term].exams++;
  }

  let grandWeightedGPA = 0;
  let grandCredits = 0;
  const terms = Object.values(termMap).map(t => {
    const gpa = t.totalCredits > 0 ? t.totalWeightedGPA / t.totalCredits : 0;
    grandWeightedGPA += t.totalWeightedGPA;
    grandCredits += t.totalCredits;
    return { term: t.term, gpa: parseFloat(gpa.toFixed(2)), exams: t.exams, credits: t.totalCredits };
  });

  const cgpa = grandCredits > 0 ? (grandWeightedGPA / grandCredits).toFixed(2) : 0;

  res.json({ success: true, cgpa: parseFloat(cgpa), totalCredits: grandCredits, terms });
});

/**
 * Publish exam results
 */
export const publishExamResults = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const { studentIds } = req.body;

  const query = { exam: examId, school: req.schoolId, branch: req.branchId, isDeleted: false };
  if (studentIds?.length) query.student = { $in: studentIds };

  const results = await ExamResult.find(query);
  const updated = await ExamResult.updateMany(query, {
    $set: { published: true, publishedAt: new Date(), publishedBy: req.user._id }
  });

  await logAction(req, {
    action: 'RESULTS_PUBLISHED',
    module: 'EXAMS',
    targetId: examId,
    details: { examId, count: updated.modifiedCount }
  });

  res.json({ success: true, message: `${updated.modifiedCount} results published`, count: updated.modifiedCount });
});

/**
 * Bulk grade exam responses
 */
export const bulkGradeExams = asyncHandler(async (req, res) => {
  const { examId, grades } = req.body;

  if (!examId || !Array.isArray(grades)) {
    return res.status(400).json({ success: false, message: 'examId and grades array required' });
  }

  let updated = 0;
  for (const g of grades) {
    const result = await ExamResult.findOne({
      exam: examId, student: g.studentId, school: req.schoolId, branch: req.branchId, isDeleted: false
    });
    if (result) {
      result.score = g.score ?? result.score;
      result.grade = g.grade ?? result.grade;
      result.gradingNotes = g.gradingNotes ?? result.gradingNotes;
      result.feedback = g.feedback ?? result.feedback;
      result.status = 'GRADED';
      result.gradedBy = req.user._id;
      result.gradedAt = new Date();
      result.percentage = result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;
      await result.save();
      updated++;
    }
  }

  await logAction(req, {
    action: 'EXAMS_BULK_GRADED',
    module: 'EXAMS',
    targetId: examId,
    details: { examId, graded: updated }
  });

  res.json({ success: true, message: `${updated} exams graded`, count: updated });
});

export default {
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
  bulkGradeExams
};
