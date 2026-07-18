import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // e.g., "Basic", "Premium", "Enterprise"
  description: { type: String, default: '' },
  code: { type: String, required: true, unique: true }, // e.g., "BASIC", "PREMIUM", "ENTERPRISE"
  monthlyPrice: { type: Number, required: true },
  yearlyPrice: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  trialDays: { type: Number, default: 0 },
  limits: {
    students: { type: Number, default: 100 },
    teachers: { type: Number, default: 10 },
    parents: { type: Number, default: 1000 },
    employees: { type: Number, default: 10 },
    branches: { type: Number, default: 1 },
    campuses: { type: Number, default: 1 },
    admins: { type: Number, default: 1 },
    storage: { type: Number, default: 1024 }, // MB
    sms: { type: Number, default: 100 },
    email: { type: Number, default: 1000 },
    api: { type: Number, default: 10000 },
    devices: { type: Number, default: 10 },
  },
  features: [{ type: String }], // List of enabled feature codes
  whiteLabel: { type: Boolean, default: false },
  customDomain: { type: Boolean, default: false },
  mobileApp: { type: Boolean, default: true },
  supportLevel: { type: String, enum: ['Basic', 'Standard', 'Premium', 'Enterprise', 'Custom'], default: 'Standard' },
  isRecommended: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

const Plan = mongoose.model('Plan', planSchema);
export default Plan;
