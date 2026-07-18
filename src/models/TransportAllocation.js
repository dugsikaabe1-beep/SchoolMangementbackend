import mongoose from 'mongoose';

const transportAllocationSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    student:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    route:        { type: mongoose.Schema.Types.ObjectId, ref: 'TransportRoute', required: true, index: true },
    vehicle:      { type: mongoose.Schema.Types.ObjectId, ref: 'TransportVehicle' },
    pickupPoint:  { type: String, trim: true },
    dropPoint:    { type: String, trim: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    startDate:    { type: Date, required: true },
    endDate:      { type: Date },
    fee:          { type: Number, default: 0 },
    status:       { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active', index: true },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

transportAllocationSchema.index({ school: 1, student: 1, academicYear: 1 });

const TransportAllocation = mongoose.model('TransportAllocation', transportAllocationSchema);
export default TransportAllocation;
