import mongoose from 'mongoose';

const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g., Midterm 2026, Final 2026
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
      enum: ['Pending', 'Scheduled', 'Published', 'Completed'], 
      default: 'Scheduled' 
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // Online Exam / CBT Features
    examType: {
      type: String,
      enum: ['OFFLINE', 'ONLINE', 'HYBRID'],
      default: 'OFFLINE'
    },
    
    // Question Selection
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
      enum: ['MANUAL', 'AUTO_RANDOM', 'AUTO_DIFFICULTY'],
      default: 'MANUAL'
    },
    
    // Online Exam Settings
    startTime: Date,
    endTime: Date,
    duration: Number, // in minutes
    passingScore: Number,
    allowRetake: {
      type: Boolean,
      default: false
    },
    maxAttempts: {
      type: Number,
      default: 1
    },
    
    // Exam Security
    requireProctoring: {
      type: Boolean,
      default: false
    },
    shuffleQuestions: {
      type: Boolean,
      default: false
    },
    shuffleOptions: {
      type: Boolean,
      default: false
    },
    showResultsImmediately: {
      type: Boolean,
      default: true
    },
    showCorrectAnswers: {
      type: Boolean,
      default: false
    },
    
    // Access Control
    password: String,
    allowedIPs: [String],
    
    // Instructions
    instructions: String,
    
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

// Index for multi-tenant and multi-branch queries
examSchema.index({ school: 1, branch: 1, academicYear: 1 });
examSchema.index({ school: 1, branch: 1, deletedAt: 1 });
examSchema.index({ school: 1, branch: 1, examType: 1 });
examSchema.index({ school: 1, branch: 1, status: 1 });

// Virtual for exam duration display
examSchema.virtual('isOnline').get(function() {
  return this.examType === 'ONLINE' || this.examType === 'HYBRID';
});

// Method to check if exam is currently active
examSchema.methods.isActive = function() {
  if (this.examType === 'OFFLINE') return false;
  const now = new Date();
  return this.startTime && this.endTime && now >= this.startTime && now <= this.endTime;
};

// Method to check if student can take exam
examSchema.methods.canTakeExam = function(attempts = 0) {
  if (this.examType === 'OFFLINE') return false;
  if (!this.isActive()) return false;
  if (attempts >= this.maxAttempts) return false;
  return true;
};

const Exam = mongoose.model('Exam', examSchema);
export default Exam;
