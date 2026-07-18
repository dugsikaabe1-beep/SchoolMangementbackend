import mongoose from 'mongoose';

const hostelAttendanceSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    hostel:       { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    room:         { type: mongoose.Schema.Types.ObjectId, ref: 'HostelRoom' },
    student:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date:         { type: Date, required: true, index: true },
    status:       { type: String, enum: ['present', 'absent', 'late', 'excused', 'on_leave'], required: true },
    checkInTime:  { type: Date },
    checkOutTime: { type: Date },
    recordedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes:        { type: String, trim: true },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

hostelAttendanceSchema.index({ school: 1, hostel: 1, date: 1, student: 1 }, { unique: true, sparse: true });

const HostelAttendance = mongoose.model('HostelAttendance', hostelAttendanceSchema);
export default HostelAttendance;
