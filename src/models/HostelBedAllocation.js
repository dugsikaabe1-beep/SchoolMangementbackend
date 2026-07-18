import mongoose from 'mongoose';

const hostelBedAllocationSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    hostel:       { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    room:         { type: mongoose.Schema.Types.ObjectId, ref: 'HostelRoom', required: true, index: true },
    student:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    startDate:    { type: Date, required: true },
    endDate:      { type: Date },
    bedNumber:    { type: String },
    monthlyFee:   { type: Number, default: 0 },
    status:       { type: String, enum: ['active', 'inactive', 'transferred', 'evicted'], default: 'active', index: true },
    allocatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

hostelBedAllocationSchema.index({ school: 1, room: 1, status: 1 });

const HostelBedAllocation = mongoose.model('HostelBedAllocation', hostelBedAllocationSchema);
export default HostelBedAllocation;
