import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', index: true },

    // Applicant (teacher / staff)
    user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Leave details
    leaveType:    {
      type: String,
      required: true,
      enum: ['Annual', 'Sick', 'Maternity', 'Paternity', 'Casual', 'Unpaid', 'Compensatory', 'Emergency', 'Study', 'Other'],
    },
    startDate:    { type: Date, required: true },
    endDate:      { type: Date, required: true },
    totalDays:    { type: Number, required: true, min: 0.5 },  // supports half-day
    isHalfDay:    { type: Boolean, default: false },
    halfDayPart:  { type: String, enum: ['morning', 'afternoon'], default: 'morning' },

    reason:       { type: String, required: true, trim: true, maxlength: 1000 },
    attachmentUrl:{ type: String, trim: true },  // Cloudinary URL for supporting document

    // Workflow
    status:       {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
      index: true,
    },
    approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt:   { type: Date },
    rejectedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt:   { type: Date },
    reviewNote:   { type: String, trim: true, maxlength: 500 },
    cancelledAt:  { type: Date },

    // Substitute teacher (optional)
    substituteTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Impact on pay
    isPaid:       { type: Boolean, default: true },  // false for unpaid leave

    // Soft delete
    isDeleted:    { type: Boolean, default: false },
    deletedAt:    { type: Date },
    deletedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

leaveSchema.index({ school: 1, branch: 1, user: 1, status: 1 });
leaveSchema.index({ school: 1, branch: 1, startDate: 1, endDate: 1 });

const Leave = mongoose.model('Leave', leaveSchema);
export default Leave;
