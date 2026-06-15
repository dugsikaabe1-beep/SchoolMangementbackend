import mongoose from 'mongoose';

const systemConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g., "maintenance_mode", "global_payment_gateways"
    value: { type: mongoose.Schema.Types.Mixed },
    description: { type: String },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);
export default SystemConfig;
