import mongoose from 'mongoose';

// Admin creates one of these per month (e.g. "March 2026 → $20 → All Students")
const paymentMonthSchema = new mongoose.Schema(
  {
    month: {
      type: String,
      required: true,
      enum: [
        'January','February','March','April','May','June',
        'July','August','September','October','November','December',
      ],
    },
    year: { type: Number, required: true },
    // Derived label e.g. "March 2026"
    monthLabel: { type: String },
    amount: { type: Number, required: true },
    // Assign to all students in school or a specific class
    assignTo: {
      type: String,
      enum: ['ALL', 'CLASS'],
      default: 'ALL',
    },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Quick stats (updated when payments are marked)
    totalStudents: { type: Number, default: 0 },
    paidCount:     { type: Number, default: 0 },
    unpaidCount:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Unique constraint: only one config per month+year per school (per class if CLASS scope)
paymentMonthSchema.index({ month: 1, year: 1, school: 1, class: 1 }, { unique: true });

// Auto-set monthLabel before save
paymentMonthSchema.pre('save', function () {
  this.monthLabel = `${this.month} ${this.year}`;
});

const PaymentMonth = mongoose.model('PaymentMonth', paymentMonthSchema);
export default PaymentMonth;
