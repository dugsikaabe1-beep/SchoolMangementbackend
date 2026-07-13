import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    questionText: {
      type: String,
      required: true,
      trim: true
    },
    questionType: {
      type: String,
      enum: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY', 'MATCHING', 'FILL_BLANK', 'NUMERIC', 'CODING', 'ORDERING'],
      required: true
    },
    questionBank: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionBank',
      required: true
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true
    },
    options: [{
      optionText: String,
      isCorrect: Boolean,
      optionOrder: Number
    }],
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed
    },
    correctAnswerText: String,
    answerKey: String,
    matchingPairs: [{
      leftItem: String,
      rightItem: String
    }],
    blanks: [{
      blankIndex: Number,
      correctAnswer: String
    }],
    numericAnswer: {
      correctValue: Number,
      tolerance: { type: Number, default: 0 },
      minValue: Number,
      maxValue: Number,
      unit: String
    },
    codingAnswer: {
      language: { type: String, enum: ['javascript', 'python', 'java', 'cpp', 'c', 'ruby', 'go', 'other'] },
      template: String,
      expectedOutput: String,
      testCases: [{
        input: String,
        expectedOutput: String,
        isHidden: { type: Boolean, default: false },
        points: { type: Number, default: 1 }
      }],
      timeLimit: { type: Number, default: 2000 },
      memoryLimit: { type: Number, default: 256 }
    },
    orderingItems: [{
      text: String,
      correctPosition: Number
    }],
    difficulty: {
      type: String,
      enum: ['EASY', 'MEDIUM', 'HARD'],
      default: 'MEDIUM'
    },
    points: {
      type: Number,
      default: 1,
      min: 0
    },
    negativeMarking: {
      enabled: { type: Boolean, default: false },
      penalty: { type: Number, default: 0, min: 0 }
    },
    bloomTaxonomyLevel: {
      type: String,
      enum: ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE'],
      default: 'REMEMBER'
    },
    learningObjective: String,
    cognitiveLevel: {
      type: String,
      enum: ['LOWER_ORDER', 'HIGHER_ORDER'],
      default: 'LOWER_ORDER'
    },
    tags: [String],
    topic: String,
    chapter: String,
    questionImage: String,
    questionAudio: String,
    questionVideo: String,
    explanation: String,
    timeLimit: Number,
    version: {
      type: Number,
      default: 1
    },
    versionHistory: [{
      version: Number,
      questionText: String,
      options: [{ optionText: String, isCorrect: Boolean, optionOrder: Number }],
      correctAnswer: mongoose.Schema.Types.Mixed,
      correctAnswerText: String,
      numericAnswer: mongoose.Schema.Types.Mixed,
      codingAnswer: mongoose.Schema.Types.Mixed,
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      changedAt: { type: Date, default: Date.now },
      changeReason: String
    }],
    approvalStatus: {
      type: String,
      enum: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'],
      default: 'DRAFT'
    },
    submittedForReview: {
      type: Date
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date,
    reviewNotes: String,
    usageStatistics: {
      timesUsed: { type: Number, default: 0 },
      totalAttempts: { type: Number, default: 0 },
      correctAttempts: { type: Number, default: 0 },
      averageTimeSpent: { type: Number, default: 0 },
      lastUsedAt: Date
    },
    randomizationGroup: String,
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      default: 'ACTIVE'
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true
    },
    academicYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

questionSchema.index({ school: 1, branch: 1, questionBank: 1 });
questionSchema.index({ school: 1, branch: 1, subject: 1 });
questionSchema.index({ school: 1, branch: 1, class: 1 });
questionSchema.index({ school: 1, branch: 1, difficulty: 1 });
questionSchema.index({ school: 1, branch: 1, tags: 1 });
questionSchema.index({ school: 1, branch: 1, deletedAt: 1 });
questionSchema.index({ school: 1, branch: 1, questionType: 1 });
questionSchema.index({ school: 1, branch: 1, bloomTaxonomyLevel: 1 });
questionSchema.index({ school: 1, branch: 1, approvalStatus: 1 });

questionSchema.virtual('questionTypeDisplay').get(function() {
  const typeMap = {
    'MULTIPLE_CHOICE': 'Multiple Choice',
    'TRUE_FALSE': 'True/False',
    'SHORT_ANSWER': 'Short Answer',
    'ESSAY': 'Essay',
    'MATCHING': 'Matching',
    'FILL_BLANK': 'Fill in the Blank',
    'NUMERIC': 'Numeric',
    'CODING': 'Coding',
    'ORDERING': 'Ordering'
  };
  return typeMap[this.questionType] || this.questionType;
});

questionSchema.virtual('correctRate').get(function() {
  if (!this.usageStatistics?.totalAttempts) return 0;
  return Math.round((this.usageStatistics.correctAttempts / this.usageStatistics.totalAttempts) * 100);
});

questionSchema.virtual('bloomLevelDisplay').get(function() {
  const bloomMap = {
    'REMEMBER': 'Remember',
    'UNDERSTAND': 'Understand',
    'APPLY': 'Apply',
    'ANALYZE': 'Analyze',
    'EVALUATE': 'Evaluate',
    'CREATE': 'Create'
  };
  return bloomMap[this.bloomTaxonomyLevel] || this.bloomTaxonomyLevel;
});

questionSchema.methods.validateAnswer = function(userAnswer) {
  switch (this.questionType) {
    case 'MULTIPLE_CHOICE': {
      const correctOption = this.options.find(opt => opt.isCorrect);
      return correctOption && correctOption._id.toString() === userAnswer;
    }
    case 'TRUE_FALSE':
      return this.correctAnswer === userAnswer;
    case 'SHORT_ANSWER':
      return this.correctAnswerText?.toLowerCase().trim() === userAnswer?.toLowerCase().trim();
    case 'ESSAY':
      return null;
    case 'MATCHING':
      return null;
    case 'FILL_BLANK': {
      const userBlanks = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
      return this.blanks.every((blank, index) => {
        return blank.correctAnswer?.toLowerCase().trim() === userBlanks[index]?.toLowerCase().trim();
      });
    }
    case 'NUMERIC': {
      const answer = this.numericAnswer;
      if (!answer) return false;
      const userVal = parseFloat(userAnswer);
      if (isNaN(userVal)) return false;
      const diff = Math.abs(userVal - answer.correctValue);
      if (answer.tolerance > 0) return diff <= answer.tolerance;
      return diff === 0;
    }
    case 'CODING': {
      return null;
    }
    case 'ORDERING': {
      return null;
    }
    default:
      return false;
  }
};

questionSchema.methods.createVersion = function(changedBy, changeReason) {
  const snapshot = {
    version: this.version,
    questionText: this.questionText,
    options: this.options ? this.options.map(o => ({ ...o.toObject ? o.toObject() : o })) : [],
    correctAnswer: this.correctAnswer,
    correctAnswerText: this.correctAnswerText,
    numericAnswer: this.numericAnswer,
    codingAnswer: this.codingAnswer,
    changedBy,
    changedAt: new Date(),
    changeReason
  };
  if (!this.versionHistory) this.versionHistory = [];
  this.versionHistory.push(snapshot);
  this.version = (this.version || 1) + 1;
};

questionSchema.methods.updateUsageStats = function(isCorrect, timeSpent) {
  if (!this.usageStatistics) {
    this.usageStatistics = { timesUsed: 0, totalAttempts: 0, correctAttempts: 0, averageTimeSpent: 0, lastUsedAt: new Date() };
  }
  this.usageStatistics.totalAttempts += 1;
  if (isCorrect) this.usageStatistics.correctAttempts += 1;
  const total = this.usageStatistics.totalAttempts;
  this.usageStatistics.averageTimeSpent = ((this.usageStatistics.averageTimeSpent * (total - 1)) + timeSpent) / total;
  this.usageStatistics.lastUsedAt = new Date();
};

const Question = mongoose.model('Question', questionSchema);
export default Question;
