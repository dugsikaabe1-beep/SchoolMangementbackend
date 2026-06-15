import mongoose from 'mongoose';

const dataArchiveSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    archiveType: {
      type: String,
      enum: ['academic-year', 'students', 'reports', 'attendance', 'exams'],
      required: true,
    },
    academicYear: { type: String, trim: true },
    title: { type: String, required: true, trim: true },
    criteria: { type: mongoose.Schema.Types.Mixed, default: {} },
    recordCount: { type: Number, default: 0 },
    status: { type: String, enum: ['archived', 'restored'], default: 'archived' },
    archivedAt: { type: Date, default: Date.now },
    restoredAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

dataArchiveSchema.index({ school: 1, branch: 1, archiveType: 1, status: 1 });

const DataArchive = mongoose.model('DataArchive', dataArchiveSchema);
export default DataArchive;
