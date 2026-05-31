import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const schoolSchema = new mongoose.Schema(
  {
    // Basic Information
    name: { type: String, required: true, trim: true, unique: true },
    subdomain: { type: String, required: true, trim: true, unique: true, lowercase: true },
    logo: { type: cloudinaryAssetSchema }, // School logo
    code: { type: String, trim: true, unique: true, sparse: true },
    
    // Contact Information
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    
    // Address Information
    address: { type: String, default: '' },
    
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

const School = mongoose.model('School', schoolSchema);
export default School;
