import mongoose from 'mongoose';

const backupRecordSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    fileName: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    label: { type: String, enum: ['manual', 'daily', 'weekly'], default: 'manual' },
    recordCount: { type: Number, required: true },
    status: { type: String, enum: ['success', 'failed', 'verified', 'integrity_error'], default: 'success' },
    verificationReport: {
      verifiedAt: Date,
      integrityScore: Number,
      errors: [String]
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

backupRecordSchema.index({ tenantId: 1, createdAt: -1 });

const BackupRecord = mongoose.model('BackupRecord', backupRecordSchema);
export default BackupRecord;
