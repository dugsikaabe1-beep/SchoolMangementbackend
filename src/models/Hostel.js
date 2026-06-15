import mongoose from 'mongoose';

const hostelSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['Boys', 'Girls', 'Mixed'], required: true },
    address: { type: String },
    description: { type: String },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Composite unique index: hostel name must be unique per school per branch
hostelSchema.index({ school: 1, branch: 1, name: 1 }, { unique: true, sparse: true });

const Hostel = mongoose.model('Hostel', hostelSchema);
export default Hostel;
