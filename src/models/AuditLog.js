import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true, index: true }, // e.g., "STUDENT_CREATE", "PAYMENT_MARK_PAID"
    targetType: { type: String }, // e.g., "Student", "Payment"
    targetId: { type: String }, // The ID of the record being acted upon
    moduleName: { type: String, index: true }, // e.g., "finance", "academic", "admission"
    description: { type: String },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    metadata: { type: mongoose.Schema.Types.Mixed }, // JSON metadata
    ipAddress: { type: String },
    userAgent: { type: String },
    device: { type: String },
    location: { type: String },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Backward compatibility aliases
auditLogSchema.virtual('user').get(function() { return this.actorUserId; });
auditLogSchema.virtual('school').get(function() { return this.tenantId; });
auditLogSchema.virtual('branch').get(function() { return this.branchId; });
auditLogSchema.virtual('details').get(function() { return this.metadata; });
auditLogSchema.virtual('module').get(function() { return this.moduleName || this.targetType; });
auditLogSchema.virtual('timestamp').get(function() { return this.createdAt; });
auditLogSchema.virtual('createdAtFormatted').get(function() {
  return this.createdAt ? this.createdAt.toLocaleString() : '';
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
