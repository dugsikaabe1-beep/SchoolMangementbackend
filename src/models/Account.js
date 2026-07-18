import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    code:         { type: String, required: true, trim: true },
    name:         { type: String, required: true, trim: true },
    type:         { type: String, enum: ['asset', 'liability', 'equity', 'revenue', 'expense'], required: true, index: true },
    subType:      { type: String, enum: ['current_asset', 'fixed_asset', 'current_liability', 'long_term_liability', 'owner_equity', 'retained_earnings', 'operating_revenue', 'non_operating_revenue', 'operating_expense', 'non_operating_expense', 'cost_of_goods'], default: undefined },
    parent:       { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    description:  { type: String, trim: true },
    normalBalance:{ type: String, enum: ['debit', 'credit'], required: true },
    isActive:     { type: Boolean, default: true },
    isSystem:     { type: Boolean, default: false },
    openingBalance:{ type: Number, default: 0 },
    currentBalance:{ type: Number, default: 0 },
    currency:     { type: String, default: 'USD' },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

accountSchema.index({ school: 1, code: 1 }, { unique: true, sparse: true });
accountSchema.index({ school: 1, type: 1 });

const Account = mongoose.model('Account', accountSchema);
export default Account;
