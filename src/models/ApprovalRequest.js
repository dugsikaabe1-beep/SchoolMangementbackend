import mongoose from 'mongoose';

const approvalRequestSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    type: { 
      type: String, 
      enum: ['student_transfer', 'fee_waiver', 'branch_creation', 'teacher_creation', 'settings_change'], 
      required: true 
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId }, // ID of the entity being modified
    data: { type: mongoose.Schema.Types.Mixed }, // New data payload
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String }
  },
  { timestamps: true }
);

const ApprovalRequest = mongoose.model('ApprovalRequest', approvalRequestSchema);
export default ApprovalRequest;
