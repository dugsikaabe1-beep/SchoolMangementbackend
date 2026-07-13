import mongoose from 'mongoose';

const questionBankSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
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
    isPublic: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      default: 'DRAFT'
    },
    approvalStatus: {
      type: String,
      enum: ['NOT_REQUIRED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'],
      default: 'NOT_REQUIRED'
    },
    approvalRequired: {
      type: Boolean,
      default: false
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    rejectionReason: String,
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    publishedAt: Date,
    version: {
      type: Number,
      default: 1
    },
    totalQuestions: {
      type: Number,
      default: 0
    },
    totalPoints: {
      type: Number,
      default: 0
    },
    difficultyDistribution: {
      easy: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      hard: { type: Number, default: 0 }
    },
    typeDistribution: {
      multipleChoice: { type: Number, default: 0 },
      trueFalse: { type: Number, default: 0 },
      shortAnswer: { type: Number, default: 0 },
      essay: { type: Number, default: 0 },
      matching: { type: Number, default: 0 },
      fillBlank: { type: Number, default: 0 },
      numeric: { type: Number, default: 0 },
      coding: { type: Number, default: 0 },
      ordering: { type: Number, default: 0 }
    },
    bloomDistribution: {
      remember: { type: Number, default: 0 },
      understand: { type: Number, default: 0 },
      apply: { type: Number, default: 0 },
      analyze: { type: Number, default: 0 },
      evaluate: { type: Number, default: 0 },
      create: { type: Number, default: 0 }
    },
    usageStatistics: {
      timesUsed: { type: Number, default: 0 },
      lastUsedAt: Date,
      averageScore: { type: Number, default: 0 }
    },
    importSource: String,
    importBatchId: String,
    tags: [String],
    category: String,
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

questionBankSchema.index({ school: 1, branch: 1, subject: 1 });
questionBankSchema.index({ school: 1, branch: 1, class: 1 });
questionBankSchema.index({ school: 1, branch: 1, tags: 1 });
questionBankSchema.index({ school: 1, branch: 1, deletedAt: 1 });
questionBankSchema.index({ school: 1, branch: 1, status: 1 });
questionBankSchema.index({ school: 1, branch: 1, approvalStatus: 1 });

questionBankSchema.methods.updateStatistics = async function() {
  const Question = (await import('./Question.js')).default;

  const stats = await Question.aggregate([
    { $match: { questionBank: this._id, isDeleted: false } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        totalPoints: { $sum: { $ifNull: ['$points', 1] } },
        easy: { $sum: { $cond: [{ $eq: ['$difficulty', 'EASY'] }, 1, 0] } },
        medium: { $sum: { $cond: [{ $eq: ['$difficulty', 'MEDIUM'] }, 1, 0] } },
        hard: { $sum: { $cond: [{ $eq: ['$difficulty', 'HARD'] }, 1, 0] } },
        multipleChoice: { $sum: { $cond: [{ $eq: ['$questionType', 'MULTIPLE_CHOICE'] }, 1, 0] } },
        trueFalse: { $sum: { $cond: [{ $eq: ['$questionType', 'TRUE_FALSE'] }, 1, 0] } },
        shortAnswer: { $sum: { $cond: [{ $eq: ['$questionType', 'SHORT_ANSWER'] }, 1, 0] } },
        essay: { $sum: { $cond: [{ $eq: ['$questionType', 'ESSAY'] }, 1, 0] } },
        matching: { $sum: { $cond: [{ $eq: ['$questionType', 'MATCHING'] }, 1, 0] } },
        fillBlank: { $sum: { $cond: [{ $eq: ['$questionType', 'FILL_BLANK'] }, 1, 0] } },
        numeric: { $sum: { $cond: [{ $eq: ['$questionType', 'NUMERIC'] }, 1, 0] } },
        coding: { $sum: { $cond: [{ $eq: ['$questionType', 'CODING'] }, 1, 0] } },
        ordering: { $sum: { $cond: [{ $eq: ['$questionType', 'ORDERING'] }, 1, 0] } },
        remember: { $sum: { $cond: [{ $eq: ['$bloomTaxonomyLevel', 'REMEMBER'] }, 1, 0] } },
        understand: { $sum: { $cond: [{ $eq: ['$bloomTaxonomyLevel', 'UNDERSTAND'] }, 1, 0] } },
        apply: { $sum: { $cond: [{ $eq: ['$bloomTaxonomyLevel', 'APPLY'] }, 1, 0] } },
        analyze: { $sum: { $cond: [{ $eq: ['$bloomTaxonomyLevel', 'ANALYZE'] }, 1, 0] } },
        evaluate: { $sum: { $cond: [{ $eq: ['$bloomTaxonomyLevel', 'EVALUATE'] }, 1, 0] } },
        create: { $sum: { $cond: [{ $eq: ['$bloomTaxonomyLevel', 'CREATE'] }, 1, 0] } }
      }
    }
  ]);

  if (stats.length > 0) {
    const s = stats[0];
    this.totalQuestions = s.total;
    this.totalPoints = s.totalPoints;
    this.difficultyDistribution = { easy: s.easy, medium: s.medium, hard: s.hard };
    this.typeDistribution = {
      multipleChoice: s.multipleChoice, trueFalse: s.trueFalse, shortAnswer: s.shortAnswer,
      essay: s.essay, matching: s.matching, fillBlank: s.fillBlank,
      numeric: s.numeric, coding: s.coding, ordering: s.ordering
    };
    this.bloomDistribution = {
      remember: s.remember, understand: s.understand, apply: s.apply,
      analyze: s.analyze, evaluate: s.evaluate, create: s.create
    };
  } else {
    this.totalQuestions = 0;
    this.totalPoints = 0;
    this.difficultyDistribution = { easy: 0, medium: 0, hard: 0 };
    this.typeDistribution = {
      multipleChoice: 0, trueFalse: 0, shortAnswer: 0, essay: 0,
      matching: 0, fillBlank: 0, numeric: 0, coding: 0, ordering: 0
    };
    this.bloomDistribution = { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 };
  }

  await this.save();
};

const QuestionBank = mongoose.model('QuestionBank', questionBankSchema);
export default QuestionBank;
