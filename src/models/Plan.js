import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // e.g., "Basic", "Premium", "Enterprise"
  code: { type: String, required: true, unique: true }, // e.g., "BASIC", "PREMIUM", "ENTERPRISE"
  monthlyPrice: { type: Number, required: true },
  yearlyPrice: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  limits: {
    students: { type: Number, default: 100 },
    teachers: { type: Number, default: 10 },
    branches: { type: Number, default: 1 },
    admins: { type: Number, default: 1 },
    storage: { type: Number, default: 1024 }, // MB
    sms: { type: Number, default: 100 },
    email: { type: Number, default: 1000 },
  },
  features: [{ type: String }], // List of enabled feature codes
  isRecommended: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

const Plan = mongoose.model('Plan', planSchema);
export default Plan;
