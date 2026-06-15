import mongoose from 'mongoose';

const financeAuditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      required: true,
      enum: [
        'PAYMENT_MARK_PAID',
        'PAYMENT_MARK_UNPAID',
        'PAYMENT_EDIT',
        'FEE_CHANGE',
        'DISCOUNT_APPLIED',
        'REFUND',
        'PAYMENT_MONTH_CREATE',
        'PAYMENT_MONTH_DELETE',
      ],
    },
    targetType: { type: String, default: 'MonthlyPayment' },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    academicYear: { type: String },
    ipAddress: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

financeAuditLogSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
financeAuditLogSchema.index({ targetId: 1, action: 1 });

const FinanceAuditLog = mongoose.model('FinanceAuditLog', financeAuditLogSchema);
export default FinanceAuditLog;
