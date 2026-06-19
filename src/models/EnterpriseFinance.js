import mongoose from 'mongoose';

const budgetItemSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  allocatedAmount: { type: Number, required: true, min: 0 },
  spentAmount: { type: Number, default: 0, min: 0 },
  remainingAmount: { type: Number, default: 0, min: 0 },
  description: { type: String, trim: true }
}, { _id: true });

const costCenterSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true },
  description: { type: String, trim: true },
  isActive: { type: Boolean, default: true }
}, { _id: true });

const enterpriseFinanceSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    fiscalYear: { type: String, required: true, index: true },
    budgetItems: [budgetItemSchema],
    costCenters: [costCenterSchema],
    financialKPIs: {
      revenueGrowthRate: { type: Number, default: 0 },
      profitMargin: { type: Number, default: 0 },
      expenseRatio: { type: Number, default: 0 },
      collectionRate: { type: Number, default: 0 },
      otherMetrics: { type: Map, of: Number }
    },
    status: { type: String, enum: ['Draft', 'Approved', 'Active', 'Closed'], default: 'Draft' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

enterpriseFinanceSchema.index({ school: 1, fiscalYear: 1 });

const EnterpriseFinance = mongoose.model('EnterpriseFinance', enterpriseFinanceSchema);
export default EnterpriseFinance;
