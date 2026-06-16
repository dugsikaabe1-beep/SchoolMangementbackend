import mongoose from 'mongoose';

const invalidContactSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },
    contactType: {
      type: String,
      enum: ['email', 'phone', 'whatsapp', 'deviceToken'],
      required: true,
      index: true
    },
    contactValue: {
      type: String,
      required: true,
      index: true
    },
    reason: {
      type: String,
      enum: [
        'invalidFormat',
        'hardBounce',
        'softBounce',
        'spamComplaint',
        'unsubscribed',
        'blocked',
        'unreachable',
        'invalidNumber',
        'invalidDeviceToken'
      ],
      required: true
    },
    details: { type: String },
    failureCount: { type: Number, default: 1 },
    lastFailureAt: { type: Date, default: Date.now },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isResolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolutionNotes: { type: String }
  },
  { timestamps: true }
);

invalidContactSchema.index({ school: 1, contactType: 1, contactValue: 1 }, { unique: true, partialFilterExpression: { isResolved: false } });
invalidContactSchema.index({ isResolved: 1 });

const InvalidContact = mongoose.model('InvalidContact', invalidContactSchema);
export default InvalidContact;
