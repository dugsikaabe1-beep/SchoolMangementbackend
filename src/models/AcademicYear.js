import mongoose from 'mongoose';

const academicYearSchema = new mongoose.Schema(
  {
    tenant: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'School', 
      required: true,
      index: true 
    },
    branch: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Branch', 
      default: null,
      index: true 
    },
    name: { type: String, required: true, trim: true }, // e.g. "2024-2025"
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isCurrent: { type: Boolean, default: false },
    status: { 
      type: String, 
      enum: ['active', 'previous', 'archived', 'draft'], 
      default: 'draft' 
    },
    isLocked: { type: Boolean, default: false }, // If locked, results/finance cannot be modified
    description: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Index for efficient filtering
academicYearSchema.index({ tenant: 1, branch: 1, isCurrent: 1 });

const AcademicYear = mongoose.model('AcademicYear', academicYearSchema);
export default AcademicYear;
