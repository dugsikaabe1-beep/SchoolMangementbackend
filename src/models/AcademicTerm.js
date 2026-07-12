import mongoose from 'mongoose';

const academicTermSchema = new mongoose.Schema(
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
    academicYear: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'AcademicYear', 
      required: true,
      index: true 
    },
    name: { type: String, required: true, trim: true }, // e.g. "First Semester", "Term 1"
    code: { type: String, trim: true }, // e.g. "SEM1", "T1"
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    order: { type: Number, default: 1 }, // To order terms in academic year
    isCurrent: { type: Boolean, default: false },
    status: { 
      type: String, 
      enum: ['active', 'upcoming', 'completed', 'archived'], 
      default: 'upcoming' 
    },
    description: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Indexes for efficient filtering
academicTermSchema.index({ tenant: 1, branch: 1, academicYear: 1 });
academicTermSchema.index({ tenant: 1, branch: 1, isCurrent: 1 });

const AcademicTerm = mongoose.model('AcademicTerm', academicTermSchema);
export default AcademicTerm;
