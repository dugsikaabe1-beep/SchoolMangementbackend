import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    // Basic Information
    questionText: {
      type: String,
      required: true,
      trim: true
    },
    questionType: {
      type: String,
      enum: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY', 'MATCHING', 'FILL_BLANK'],
      required: true
    },
    
    // Question Bank Association
    questionBank: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionBank',
      required: true
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
    
    // Multiple Choice Options
    options: [{
      optionText: String,
      isCorrect: Boolean,
      optionOrder: Number
    }],
    
    // True/False
    correctAnswer: {
      type: Boolean
    },
    
    // Short Answer and Essay
    correctAnswerText: String,
    answerKey: String, // For grading reference
    
    // Matching Questions
    matchingPairs: [{
      leftItem: String,
      rightItem: String
    }],
    
    // Fill in the Blank
    blanks: [{
      blankIndex: Number,
      correctAnswer: String
    }],
    
    // Difficulty Level
    difficulty: {
      type: String,
      enum: ['EASY', 'MEDIUM', 'HARD'],
      default: 'MEDIUM'
    },
    
    // Points/Marks
    points: {
      type: Number,
      default: 1,
      min: 0
    },
    
    // Question Metadata
    tags: [String],
    topic: String,
    chapter: String,
    
    // Media Attachments (stored in Cloudinary)
    questionImage: String,
    questionAudio: String,
    questionVideo: String,
    
    // Explanation for students (shown after exam)
    explanation: String,
    
    // Time limit for this question (optional)
    timeLimit: Number, // in seconds
    
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
questionSchema.index({ school: 1, branch: 1, questionBank: 1 });
questionSchema.index({ school: 1, branch: 1, subject: 1 });
questionSchema.index({ school: 1, branch: 1, class: 1 });
questionSchema.index({ school: 1, branch: 1, difficulty: 1 });
questionSchema.index({ school: 1, branch: 1, tags: 1 });
questionSchema.index({ school: 1, branch: 1, deletedAt: 1 });

// Virtual for question type display
questionSchema.virtual('questionTypeDisplay').get(function() {
  const typeMap = {
    'MULTIPLE_CHOICE': 'Multiple Choice',
    'TRUE_FALSE': 'True/False',
    'SHORT_ANSWER': 'Short Answer',
    'ESSAY': 'Essay',
    'MATCHING': 'Matching',
    'FILL_BLANK': 'Fill in the Blank'
  };
  return typeMap[this.questionType] || this.questionType;
});

// Method to validate answer
questionSchema.methods.validateAnswer = function(userAnswer) {
  switch (this.questionType) {
    case 'MULTIPLE_CHOICE':
      const correctOption = this.options.find(opt => opt.isCorrect);
      return correctOption && correctOption._id.toString() === userAnswer;
    
    case 'TRUE_FALSE':
      return this.correctAnswer === userAnswer;
    
    case 'SHORT_ANSWER':
      // Case-insensitive comparison
      return this.correctAnswerText?.toLowerCase().trim() === userAnswer?.toLowerCase().trim();
    
    case 'ESSAY':
      // Essay answers require manual grading
      return null;
    
    case 'MATCHING':
      // Complex validation for matching questions
      // This would require comparing user's matching pairs
      return null;
    
    case 'FILL_BLANK':
      // Validate each blank
      const userBlanks = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
      return this.blanks.every((blank, index) => {
        return blank.correctAnswer?.toLowerCase().trim() === userBlanks[index]?.toLowerCase().trim();
      });
    
    default:
      return false;
  }
};

const Question = mongoose.model('Question', questionSchema);
export default Question;
