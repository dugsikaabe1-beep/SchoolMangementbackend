import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const schoolSchema = new mongoose.Schema(
  {
    // Basic Information
    name: { type: String, required: true, trim: true, unique: true },
    subdomain: { type: String, required: true, trim: true, unique: true, lowercase: true },
    logo: { type: cloudinaryAssetSchema }, // School logo
    stamp: { type: cloudinaryAssetSchema }, // School stamp
    signature: { type: cloudinaryAssetSchema }, // Principal signature
    motto: { type: String, trim: true, default: '' },
    code: { type: String, trim: true, unique: true, sparse: true },
    schoolType: { type: String, trim: true, default: '' }, // e.g., Primary, Secondary, High School, etc.
    country: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    
    // Contact Information
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true, default: '' },
    
    // Address Information
    address: { type: String, default: '' },

    // Onboarding Status
    onboarding: {
      isCompleted: { type: Boolean, default: false },
      currentStep: { type: Number, default: 1 },
      steps: {
        schoolInfo: { type: Boolean, default: false },
        academicYear: { type: Boolean, default: false },
        branches: { type: Boolean, default: false },
        classes: { type: Boolean, default: false },
        teachers: { type: Boolean, default: false },
        students: { type: Boolean, default: false }
      }
    },

    // Tenant configuration
    settings: {
      currency: { type: String, default: 'USD' },
      timezone: { type: String, default: 'UTC' },
      language: { type: String, default: 'en' },
      gracePeriodDays: { type: Number, default: 7, min: 0 },
      restrictedModeOnExpiry: { type: Boolean, default: true },
      academicYearSettings: {
        autoActivateNext: { type: Boolean, default: false },
        defaultStatus: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
      },
      enabledModules: [{ type: String }], // List of module codes enabled for this school
    },
    
    // Status and Statistics
    status: { 
      type: String, 
      enum: ['active', 'inactive', 'suspended', 'closed'], 
      default: 'active' 
    },
    isActive: { type: Boolean, default: true },
    
    // Subscription Management (Super Admin)
    subscription: {
      type: { 
        type: String, 
        enum: ['monthly', 'yearly', 'trial'], 
        default: 'trial' 
      },
      plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
      status: { 
        type: String, 
        enum: ['Trial', 'Active', 'Expiring Soon', 'Expired', 'Suspended', 'Cancelled'], 
        default: 'Trial' 
      },
      approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'denied'],
        default: 'pending',
      },
      approvalNote: { type: String, trim: true },
      approvedAt: { type: Date },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      startDate: { type: Date, default: Date.now },
      endDate: { type: Date },
      paymentStatus: { 
        type: String, 
        enum: ['Paid', 'Unpaid', 'Pending'], 
        default: 'Pending' 
      },
      lastPaymentDate: { type: Date },
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
      blockedByAdmin: { type: Boolean, default: false },
      blockedReason: { type: String },
      // Plan Limits
      limits: {
        students: { type: Number, default: 100 },
        teachers: { type: Number, default: 10 },
        branches: { type: Number, default: 1 },
        admins: { type: Number, default: 1 },
        storage: { type: Number, default: 1024 }, // in MB
        sms: { type: Number, default: 100 },
        email: { type: Number, default: 1000 },
      },
      healthScore: {
        score: { type: Number, default: 100 }, // 0-100
        rating: { type: String, enum: ['Excellent', 'Good', 'Average', 'Needs Attention'], default: 'Excellent' },
        lastCalculated: { type: Date }
      }
    },
    
    // Legacy compatibility
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    merchantNumber: { type: String, default: '' } // EVC Plus merchant number for USSD payment
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual: Check if subscription is expired
schoolSchema.virtual('isSubscriptionExpired').get(function() {
  if (!this.subscription?.endDate) return false;
  return new Date() > this.subscription.endDate;
});

// Virtual: Check if school is blocked (expired or manually blocked)
schoolSchema.virtual('isBlocked').get(function() {
  // Check if subscription expired
  if (this.subscription?.endDate && new Date() > this.subscription.endDate) return true;
  // Check if not active
  if (!this.isActive) return true;
  return false;
});

// Virtual: Days until subscription expires
schoolSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.subscription?.endDate) return null;
  const diff = this.subscription.endDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Indexes for better performance
schoolSchema.index({ status: 1 });
schoolSchema.index({ isActive: 1 });
schoolSchema.index({ 'subscription.endDate': 1, isActive: 1 });

const School = mongoose.model('School', schoolSchema);
export default School;
