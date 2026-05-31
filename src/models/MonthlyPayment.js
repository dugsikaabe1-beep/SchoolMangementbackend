import mongoose from 'mongoose';

// One document per student per PaymentMonth
const monthlyPaymentSchema = new mongoose.Schema(
  {
    paymentMonth: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMonth',
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
    },
    // Denormalised for fast filtering
    month:      { type: String, required: true }, // "March"
    year:       { type: Number, required: true },
    monthLabel: { type: String },                 // "March 2026"
    amount:     { type: Number, required: true },

    status: {
      type: String,
      enum: ['PAID', 'UNPAID'],
      default: 'UNPAID',
    },
    paymentDate: { type: Date, default: null },
    paidBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // admin
    remarks: { type: String, default: '' },
    school:  { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  },
  { timestamps: true }
);

// One payment record per student per month per school
monthlyPaymentSchema.index(
  { paymentMonth: 1, student: 1, school: 1 },
  { unique: true }
);

const MonthlyPayment = mongoose.model('MonthlyPayment', monthlyPaymentSchema);
export default MonthlyPayment;
