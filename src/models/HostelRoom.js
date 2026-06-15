import mongoose from 'mongoose';

const hostelRoomSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    hostel: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    roomNumber: { type: String, required: true },
    roomType: { type: String, enum: ['Single', 'Double', 'Triple', 'Dormitory'], default: 'Double' },
    capacity: { type: Number, required: true },
    availableBeds: { type: Number, required: true },
    costPerBed: { type: Number, default: 0 },
    status: { type: String, enum: ['Active', 'Maintenance', 'Full'], default: 'Active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

const HostelRoom = mongoose.model('HostelRoom', hostelRoomSchema);
export default HostelRoom;
