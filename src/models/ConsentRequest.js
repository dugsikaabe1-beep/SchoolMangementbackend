import mongoose from 'mongoose';

const consentRequestSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: ['trip', 'event', 'medical', 'activity'],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    eventDate: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'approved', 'declined', 'expired'],
      default: 'pending',
      index: true,
    },
    approvedAt: { type: Date },
    declinedAt: { type: Date },
    responseNote: { type: String, trim: true },
    mobileApprovalToken: { type: String, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

consentRequestSchema.index({ school: 1, branch: 1, status: 1, isDeleted: 1 });

const ConsentRequest = mongoose.model('ConsentRequest', consentRequestSchema);
export default ConsentRequest;
