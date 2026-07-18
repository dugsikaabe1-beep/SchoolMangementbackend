import mongoose from 'mongoose';

const fiscalPeriodSchema = new mongoose.Schema(
  {
    school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name:        { type: String, required: true, trim: true },
    startDate:   { type: Date, required: true },
    endDate:     { type: Date, required: true },
    status:      { type: String, enum: ['open', 'closed', 'locked'], default: 'open', index: true },
    closedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedAt:    { type: Date },
    isDeleted:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

fiscalPeriodSchema.index({ school: 1, startDate: 1, endDate: 1 });

const FiscalPeriod = mongoose.model('FiscalPeriod', fiscalPeriodSchema);
export default FiscalPeriod;
