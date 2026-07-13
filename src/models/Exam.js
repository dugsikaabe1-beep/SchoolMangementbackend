import mongoose from 'mongoose';

const gradingScaleSchema = new mongoose.Schema({
  grade: { type: String, required: true },
  minPercentage: { type: Number, required: true },
  maxPercentage: { type: Number, required: true },
  gpaPoints: Number,
  description: String
}, { _id: false });

const randomizationConfigSchema = new mongoose.Schema({
  easyCount: { type: Number, default: 0 },
  mediumCount: { type: Number, default: 0 },
  hardCount: { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
  questionPoolSize: { type: Number, default: 0 },
  timePerQuestion: { type: Number, default: 0 }
}, { _id: false });

const antiCheatConfigSchema = new mongoose.Schema({
  tabSwitchLimit: { type: Number, default: 3 },
  fullScreenRequired: { type: Boolean, default: true },
  webCamMonitoring: { type: Boolean, default: false },
  screenRecording: { type: Boolean, default: false },
  copyPasteDisabled: { type: Boolean, default: true },
  rightClickDisabled: { type: Boolean, default: true },
  browserFullScreen: { type: Boolean, default: false },
  ipRestriction: { type: Boolean, default: false },
  geoFencing: { type: Boolean, default: false },
  maxDistanceMeters: { type: Number, default: 100 }
}, { _id: false });

const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    term: {
      type: String,
      enum: ['Monthly1', 'Midterm', 'Monthly2', 'Final'],
      required: true
    },
    date: { type: Date, required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    maxMarks: { type: Number, required: true, default: 100 },
    status: {
      type: String,
      enum: ['Draft', 'Scheduled', 'Published', 'In_Progress', 'Completed', 'Cancelled'],
      default: 'Scheduled'
    },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAt: Date,
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    examType: {
      type: String,
      enum: ['OFFLINE', 'ONLINE', 'HYBRID'],
      default: 'OFFLINE'
    },
    examCategory: {
      type: String,
      enum: ['FORMATIVE', 'SUMMATIVE', 'DIAGNOSTIC', 'PLACEMENT', 'PRACTICE'],
      default: 'SUMMATIVE'
    },
    questionBank: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionBank'
    },
    questions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    }],
    questionSelectionMode: {
      type: String,
      enum: ['MANUAL', 'AUTO_RANDOM', 'AUTO_DIFFICULTY', 'AUTO_BLOOM'],
      default: 'MANUAL'
    },
    randomizationConfig: randomizationConfigSchema,
    startTime: Date,
    endTime: Date,
    duration: Number,
    passingScore: Number,
    passingPercentage: Number,
    allowRetake: { type: Boolean, default: false },
    maxAttempts: { type: Number, default: 1 },
    negativeMarking: {
      enabled: { type: Boolean, default: false },
      penaltyPerWrong: { type: Number, default: 0 },
      maxNegativePercentage: { type: Number, default: 25 }
    },
    gradingScale: [gradingScaleSchema],
    defaultGradingScale: {
      type: Boolean,
      default: true
    },
    autoGradingEnabled: { type: Boolean, default: true },
    timePerQuestion: { type: Boolean, default: false },
    requireProctoring: { type: Boolean, default: false },
    antiCheatConfig: antiCheatConfigSchema,
    shuffleQuestions: { type: Boolean, default: false },
    shuffleOptions: { type: Boolean, default: false },
    showResultsImmediately: { type: Boolean, default: true },
    showCorrectAnswers: { type: Boolean, default: false },
    password: String,
    allowedIPs: [String],
    instructions: String,
    totalRegistered: { type: Number, default: 0 },
    totalCompleted: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

examSchema.index({ school: 1, branch: 1, academicYear: 1 });
examSchema.index({ school: 1, branch: 1, deletedAt: 1 });
examSchema.index({ school: 1, branch: 1, examType: 1 });
examSchema.index({ school: 1, branch: 1, status: 1 });

examSchema.virtual('isOnline').get(function() {
  return this.examType === 'ONLINE' || this.examType === 'HYBRID';
});

examSchema.methods.isActive = function() {
  if (this.examType === 'OFFLINE') return false;
  const now = new Date();
  return this.startTime && this.endTime && now >= this.startTime && now <= this.endTime;
};

examSchema.methods.canTakeExam = function(attempts = 0) {
  if (this.examType === 'OFFLINE') return false;
  if (!this.isActive()) return false;
  if (attempts >= this.maxAttempts) return false;
  return true;
};

examSchema.methods.getGradeForPercentage = function(percentage) {
  if (this.gradingScale && this.gradingScale.length > 0) {
    const sorted = [...this.gradingScale].sort((a, b) => b.minPercentage - a.minPercentage);
    const match = sorted.find(g => percentage >= g.minPercentage && percentage <= g.maxPercentage);
    if (match) return match.grade;
    return 'F';
  }
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 50) return 'D';
  return 'F';
};

examSchema.methods.getGPAPoints = function(percentage) {
  if (this.gradingScale && this.gradingScale.length > 0) {
    const sorted = [...this.gradingScale].sort((a, b) => b.minPercentage - a.minPercentage);
    const match = sorted.find(g => percentage >= g.minPercentage && percentage <= g.maxPercentage);
    return match?.gpaPoints || 0;
  }
  if (percentage >= 90) return 4.0;
  if (percentage >= 80) return 3.0;
  if (percentage >= 70) return 2.0;
  if (percentage >= 60) return 1.0;
  return 0;
};

const Exam = mongoose.model('Exam', examSchema);
export default Exam;
