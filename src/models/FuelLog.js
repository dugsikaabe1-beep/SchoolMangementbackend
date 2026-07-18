import mongoose from 'mongoose';

const fuelLogSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    vehicle:      { type: mongoose.Schema.Types.ObjectId, ref: 'TransportVehicle', required: true, index: true },
    date:         { type: Date, required: true, index: true },
    liters:       { type: Number, required: true, min: 0 },
    costPerLiter: { type: Number, required: true, min: 0 },
    totalCost:    { type: Number, required: true, min: 0 },
    odometer:     { type: Number },
    fuelType:     { type: String, enum: ['diesel', 'petrol', 'electric', 'other'], default: 'diesel' },
    station:      { type: String, trim: true },
    driver:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes:        { type: String, trim: true },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

fuelLogSchema.index({ school: 1, vehicle: 1, date: -1 });

const FuelLog = mongoose.model('FuelLog', fuelLogSchema);
export default FuelLog;
