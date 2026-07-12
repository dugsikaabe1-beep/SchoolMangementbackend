import mongoose from 'mongoose';

const questionBankSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    
    // Subject and Class Association
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
    
    // Question Bank Settings
    isPublic: {
      type: Boolean,
      default: false // If true, can be shared across schools (for super admin)
    },
    
    // Question Statistics
    totalQuestions: {
      type: Number,
      default: 0
    },
    
    // Difficulty Distribution
    difficultyDistribution: {
      easy: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      hard: { type: Number, default: 0 }
    },
    
    // Question Type Distribution
    typeDistribution: {
      multipleChoice: { type: Number, default: 0 },
      trueFalse: { type: Number, default: 0 },
      shortAnswer: { type: Number, default: 0 },
      essay: { type: Number, default: 0 },
      matching: { type: Number, default: 0 },
      fillBlank: { type: Number, default: 0 }
    },
    
    // Tags for categorization
    tags: [String],
    category: String,
    
    // Multi-tenancy
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
    
    // Audit Fields
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
    deletedAt: {
      type: Date
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

// Indexes for efficient queries
questionBankSchema.index({ school: 1, branch: 1, subject: 1 });
questionBankSchema.index({ school: 1, branch: 1, class: 1 });
questionBankSchema.index({ school: 1, branch: 1, tags: 1 });
questionBankSchema.index({ school: 1, branch: 1, deletedAt: 1 });

// Method to update question statistics
questionBankSchema.methods.updateStatistics = async function() {
  const Question = (await import('./Question.js')).default;
  
  const stats = await Question.aggregate([
    {
      $match: {
        questionBank: this._id,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        easy: {
          $sum: { $cond: [{ $eq: ['$difficulty', 'EASY'] }, 1, 0] }
        },
        medium: {
          $sum: { $cond: [{ $eq: ['$difficulty', 'MEDIUM'] }, 1, 0] }
        },
        hard: {
          $sum: { $cond: [{ $eq: ['$difficulty', 'HARD'] }, 1, 0] }
        },
        multipleChoice: {
          $sum: { $cond: [{ $eq: ['$questionType', 'MULTIPLE_CHOICE'] }, 1, 0] }
        },
        trueFalse: {
          $sum: { $cond: [{ $eq: ['$questionType', 'TRUE_FALSE'] }, 1, 0] }
        },
        shortAnswer: {
          $sum: { $cond: [{ $eq: ['$questionType', 'SHORT_ANSWER'] }, 1, 0] }
        },
        essay: {
          $sum: { $cond: [{ $eq: ['$questionType', 'ESSAY'] }, 1, 0] }
        },
        matching: {
          $sum: { $cond: [{ $eq: ['$questionType', 'MATCHING'] }, 1, 0] }
        },
        fillBlank: {
          $sum: { $cond: [{ $eq: ['$questionType', 'FILL_BLANK'] }, 1, 0] }
        }
      }
    }
  ]);
  
  if (stats.length > 0) {
    this.totalQuestions = stats[0].total;
    this.difficultyDistribution = {
      easy: stats[0].easy,
      medium: stats[0].medium,
      hard: stats[0].hard
    };
    this.typeDistribution = {
      multipleChoice: stats[0].multipleChoice,
      trueFalse: stats[0].trueFalse,
      shortAnswer: stats[0].shortAnswer,
      essay: stats[0].essay,
      matching: stats[0].matching,
      fillBlank: stats[0].fillBlank
    };
  } else {
    this.totalQuestions = 0;
    this.difficultyDistribution = { easy: 0, medium: 0, hard: 0 };
    this.typeDistribution = {
      multipleChoice: 0,
      trueFalse: 0,
      shortAnswer: 0,
      essay: 0,
      matching: 0,
      fillBlank: 0
    };
  }
  
  await this.save();
};

const QuestionBank = mongoose.model('QuestionBank', questionBankSchema);
export default QuestionBank;
