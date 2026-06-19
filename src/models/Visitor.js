import mongoose from 'mongoose';

const visitorSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    visitorName: { type: String, required: true, trim: true },
    visitorPhone: { type: String, trim: true },
    visitorEmail: { type: String, trim: true, lowercase: true },
    visitorAddress: { type: String, trim: true },
    purpose: { type: String, required: true, trim: true },
    personToVisit: { type: String, trim: true },
    checkInTime: { type: Date, required: true, default: Date.now },
    checkOutTime: { type: Date },
    status: { type: String, enum: ['Checked In', 'Checked Out'], default: 'Checked In' },
    qrCode: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

visitorSchema.index({ school: 1, checkInTime: -1 });
visitorSchema.index({ school: 1, status: 1 });

const Visitor = mongoose.model('Visitor', visitorSchema);
export default Visitor;
