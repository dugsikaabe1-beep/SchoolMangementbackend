import mongoose from 'mongoose';

const examResultSchema = new mongoose.Schema(
  {
    // Exam Association
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true
    },
    
    // Student Association
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    
    // Class and Subject
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    
    // Exam Status
    status: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'GRADED', 'CANCELLED'],
      default: 'NOT_STARTED'
    },
    
    // Timing
    startTime: Date,
    endTime: Date,
    timeTaken: Number, // in seconds
    submittedAt: Date,
    gradedAt: Date,
    
    // Scores
    totalQuestions: {
      type: Number,
      default: 0
    },
    attemptedQuestions: {
      type: Number,
      default: 0
    },
    correctAnswers: {
      type: Number,
      default: 0
    },
    wrongAnswers: {
      type: Number,
      default: 0
    },
    skippedQuestions: {
      type: Number,
      default: 0
    },
    score: {
      type: Number,
      default: 0
    },
    maxScore: {
      type: Number,
      default: 0
    },
    percentage: {
      type: Number,
      default: 0
    },
    grade: String,
    
    // Attempt Number (for retakes)
    attemptNumber: {
      type: Number,
      default: 1
    },
    
    // Question Responses
    responses: [{
      question: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question'
      },
      answer: mongoose.Schema.Types.Mixed, // Can be string, array, object depending on question type
      isCorrect: Boolean,
      isSkipped: Boolean,
      timeSpent: Number, // in seconds
      points: Number
    }],
    
    // Proctoring Data (if enabled)
    proctoringData: {
      flaggedEvents: [{
        type: String, // 'TAB_SWITCH', 'COPY_PASTE', 'MULTIPLE_WINDOWS', etc.
        timestamp: Date,
        details: String
      }],
      screenshots: [String], // Cloudinary URLs
      webcamSnapshots: [String], // Cloudinary URLs
      ip: String,
      browserInfo: String
    },
    
    // Grading
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    gradingNotes: String,
    
    // Feedback
    feedback: String,
    
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
examResultSchema.index({ school: 1, branch: 1, exam: 1 });
examResultSchema.index({ school: 1, branch: 1, student: 1 });
examResultSchema.index({ school: 1, branch: 1, status: 1 });
examResultSchema.index({ school: 1, branch: 1, deletedAt: 1 });
examResultSchema.index({ exam: 1, student: 1, attemptNumber: 1 }, { unique: true });

// Virtual for pass/fail status
examResultSchema.virtual('passed').get(function() {
  if (!this.exam || !this.exam.passingScore) return null;
  return this.percentage >= this.exam.passingScore;
});

// Method to calculate score
examResultSchema.methods.calculateScore = async function() {
  const Exam = (await import('./Exam.js')).default;
  const exam = await Exam.findById(this.exam);
  
  if (!exam) return;
  
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  let totalScore = 0;
  
  for (const response of this.responses) {
    if (response.isSkipped) {
      skipped++;
    } else if (response.isCorrect) {
      correct++;
      totalScore += response.points || 0;
    } else {
      wrong++;
    }
  }
  
  this.correctAnswers = correct;
  this.wrongAnswers = wrong;
  this.skippedQuestions = skipped;
  this.attemptedQuestions = this.responses.length - skipped;
  this.score = totalScore;
  this.maxScore = exam.maxMarks;
  this.percentage = this.maxScore > 0 ? (this.score / this.maxScore) * 100 : 0;
  
  // Auto-grade based on percentage
  if (this.percentage >= 90) this.grade = 'A';
  else if (this.percentage >= 80) this.grade = 'B';
  else if (this.percentage >= 70) this.grade = 'C';
  else if (this.percentage >= 60) this.grade = 'D';
  else if (this.percentage >= 50) this.grade = 'E';
  else this.grade = 'F';
  
  await this.save();
};

// Method to start exam
examResultSchema.methods.startExam = async function() {
  this.status = 'IN_PROGRESS';
  this.startTime = new Date();
  await this.save();
};

// Method to submit exam
examResultSchema.methods.submitExam = async function() {
  this.status = 'SUBMITTED';
  this.endTime = new Date();
  this.submittedAt = new Date();
  if (this.startTime) {
    this.timeTaken = Math.floor((this.endTime - this.startTime) / 1000);
  }
  await this.calculateScore();
};

const ExamResult = mongoose.model('ExamResult', examResultSchema);
export default ExamResult;
