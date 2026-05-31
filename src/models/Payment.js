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
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    remarks: { type: String, default: '' },
  },
  { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
