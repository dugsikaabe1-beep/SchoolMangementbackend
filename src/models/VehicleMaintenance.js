import mongoose from 'mongoose';

const vehicleMaintenanceSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    vehicle:      { type: mongoose.Schema.Types.ObjectId, ref: 'TransportVehicle', required: true, index: true },
    type:         { type: String, enum: ['routine', 'repair', 'emergency', 'inspection', 'tire_change', 'oil_change'], required: true },
    description:  { type: String, required: true, trim: true },
    scheduledDate:{ type: Date, required: true },
    completedDate:{ type: Date },
    cost:         { type: Number, min: 0, default: 0 },
    vendor:       { type: String, trim: true },
    odometer:     { type: Number },
    status:       { type: String, enum: ['scheduled', 'in_progress', 'completed', 'cancelled'], default: 'scheduled', index: true },
    priority:     { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    nextServiceDate: { type: Date },
    nextServiceOdometer: { type: Number },
    attachments:  [{ url: String, name: String }],
    notes:        { type: String, trim: true },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

vehicleMaintenanceSchema.index({ school: 1, vehicle: 1, scheduledDate: -1 });

const VehicleMaintenance = mongoose.model('VehicleMaintenance', vehicleMaintenanceSchema);
export default VehicleMaintenance;
