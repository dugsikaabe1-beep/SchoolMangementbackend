import mongoose from 'mongoose';

const riskFactorSchema = new mongoose.Schema({
  factor: { 
    type: String, 
    enum: ['Low Attendance', 'Poor Grades', 'Fee Delay', 'Behavioral Issue', 'Other'],
    required: true 
  },
  severity: { type: Number, required: true, min: 1, max: 10 },
  description: { type: String, trim: true }
}, { _id: false });

const riskAssessmentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    academicYear: { type: String, required: true, index: true },
    riskLevel: { 
      type: String, 
      enum: ['Low Risk', 'Medium Risk', 'High Risk'], 
      required: true,
      index: true 
    },
    riskScore: { type: Number, required: true, min: 0, max: 100 },
    factors: [riskFactorSchema],
    recommendations: { type: String, trim: true },
    alertsSent: [{ 
      type: { type: String, enum: ['Email', 'SMS', 'Push Notification'] },
      sentTo: { type: String, trim: true },
      sentAt: { type: Date, default: Date.now }
    }],
    status: { type: String, enum: ['Active', 'Resolved', 'Closed'], default: 'Active' },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

riskAssessmentSchema.index({ school: 1, student: 1, academicYear: 1 }, { unique: true });
riskAssessmentSchema.index({ school: 1, riskLevel: 1, academicYear: 1 });

const RiskAssessment = mongoose.model('RiskAssessment', riskAssessmentSchema);
export default RiskAssessment;
