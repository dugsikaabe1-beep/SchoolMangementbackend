import mongoose from 'mongoose';

const transportVehicleSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    vehicleNumber: { type: String, required: true, unique: true, trim: true },
    model: { type: String, trim: true },
    capacity: { type: Number, required: true },
    driverName: { type: String },
    driverPhone: { type: String },
    status: { type: String, enum: ['Active', 'Maintenance', 'Inactive'], default: 'Active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

const TransportVehicle = mongoose.model('TransportVehicle', transportVehicleSchema);
export default TransportVehicle;
