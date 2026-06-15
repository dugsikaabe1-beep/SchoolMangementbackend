import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'Mobile Money', 'Online'],
      default: 'Cash',
    },
    month: { type: String, required: true }, // e.g., 'April 2026'
    transactionId: { type: String, unique: true },
    status: {
      type: String,
      enum: ['Paid', 'Pending', 'Failed'],
      default: 'Paid',
    },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    academicYear: { type: String, required: true, index: true },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: { type: String, default: '' },
  },
  { timestamps: true }
);

// Index for multi-tenant and multi-branch queries
paymentSchema.index({ school: 1, branch: 1, date: 1 });
paymentSchema.index({ student: 1, date: 1 });
paymentSchema.index({ school: 1, branch: 1, deletedAt: 1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
