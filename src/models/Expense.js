import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    academicYear: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now },
    category: { 
      type: String, 
      enum: ['Salary', 'Rent', 'Utility', 'Maintenance', 'Equipment', 'Supplies', 'Marketing', 'Other'],
      default: 'Other'
    },
    paymentMethod: { 
      type: String, 
      enum: ['Cash', 'Bank Transfer', 'Cheque', 'Online'], 
      default: 'Cash' 
    },
    receipt: { type: String }, // URL to receipt image
    status: { type: String, enum: ['Paid', 'Pending', 'Cancelled'], default: 'Paid' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

expenseSchema.index({ school: 1, branch: 1, date: -1 });

const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;
