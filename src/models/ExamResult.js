import mongoose from 'mongoose';

const examResultSchema = new mongoose.Schema(
  {
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
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
    status: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'GRADED', 'REVIEW_REQUESTED', 'REVIEWED', 'CANCELLED'],
      default: 'NOT_STARTED'
    },
    startTime: Date,
    endTime: Date,
    timeTaken: Number,
    submittedAt: Date,
    gradedAt: Date,
    totalQuestions: { type: Number, default: 0 },
    attemptedQuestions: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    wrongAnswers: { type: Number, default: 0 },
    skippedQuestions: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    grade: String,
    gpa: Number,
    cgpa: Number,
    negativeMarkingApplied: { type: Boolean, default: false },
    negativeMarksDeducted: { type: Number, default: 0 },
    classRank: Number,
    subjectRank: Number,
    totalStudentsInClass: Number,
    percentile: Number,
    attemptNumber: { type: Number, default: 1 },
    responses: [{
      question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
      answer: mongoose.Schema.Types.Mixed,
      isCorrect: Boolean,
      isSkipped: Boolean,
      timeSpent: Number,
      points: Number,
      negativePoints: { type: Number, default: 0 },
      autoGraded: { type: Boolean, default: true },
      gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      feedback: String
    }],
    proctoringData: {
      flaggedEvents: [{
        type: String,
        timestamp: Date,
        details: String
      }],
      screenshots: [String],
      webcamSnapshots: [String],
      ip: String,
      browserInfo: String,
      totalTabSwitches: { type: Number, default: 0 },
      fullScreenExits: { type: Number, default: 0 }
    },
    published: { type: Boolean, default: false },
    publishedAt: Date,
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewRequested: { type: Boolean, default: false },
    reviewRequestedAt: Date,
    reviewReason: String,
    reviewStatus: {
      type: String,
      enum: ['NONE', 'PENDING', 'ACCEPTED', 'REJECTED'],
      default: 'NONE'
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewNotes: String,
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    gradingNotes: String,
    feedback: String,
    importBatchId: String,
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

examResultSchema.index({ school: 1, branch: 1, exam: 1 });
examResultSchema.index({ school: 1, branch: 1, student: 1 });
examResultSchema.index({ school: 1, branch: 1, status: 1 });
examResultSchema.index({ school: 1, branch: 1, deletedAt: 1 });
examResultSchema.index({ school: 1, branch: 1, published: 1 });
examResultSchema.index({ school: 1, branch: 1, class: 1, subject: 1 });
examResultSchema.index({ exam: 1, student: 1, attemptNumber: 1 }, { unique: true });

examResultSchema.virtual('passed').get(function() {
  if (!this.exam || !this.exam.passingScore) return null;
  return this.percentage >= this.exam.passingScore;
});

examResultSchema.methods.calculateScore = async function() {
  const Exam = (await import('./Exam.js')).default;
  const exam = await Exam.findById(this.exam);
  if (!exam) return;

  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  let totalScore = 0;
  let totalNegative = 0;

  for (const response of this.responses) {
    if (response.isSkipped) {
      skipped++;
    } else if (response.isCorrect) {
      correct++;
      totalScore += response.points || 0;
    } else {
      wrong++;
      if (exam.negativeMarking?.enabled && response.points > 0) {
        const penalty = Math.min(
          response.points * (exam.negativeMarking.penaltyPerWrong / 100),
          response.points * (exam.negativeMarking.maxNegativePercentage / 100)
        );
        totalNegative += penalty;
        response.negativePoints = penalty;
      }
    }
  }

  this.correctAnswers = correct;
  this.wrongAnswers = wrong;
  this.skippedQuestions = skipped;
  this.attemptedQuestions = this.responses.length - skipped;
  this.score = Math.max(0, totalScore - totalNegative);
  this.maxScore = exam.maxMarks;
  this.percentage = this.maxScore > 0 ? (this.score / this.maxScore) * 100 : 0;
  this.negativeMarkingApplied = exam.negativeMarking?.enabled || false;
  this.negativeMarksDeducted = totalNegative;

  this.grade = exam.getGradeForPercentage(this.percentage);
  this.gpa = exam.getGPAPoints(this.percentage);

  await this.save();
};

examResultSchema.methods.startExam = async function() {
  this.status = 'IN_PROGRESS';
  this.startTime = new Date();
  await this.save();
};

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
