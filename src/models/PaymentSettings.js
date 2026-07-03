import mongoose from 'mongoose';

/**
 * Payment Settings Model
 * Stores school-specific payment provider configurations
 * Each school can have multiple payment providers enabled
 */
const paymentSettingsSchema = new mongoose.Schema(
  {
    // Tenant (School) this payment setting belongs to
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },

    // Provider type (e.g., EVC_PLUS, ZAAD, SAHAL, SALAAM_BANK, PREMIER_BANK)
    provider: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      enum: ['EVC_PLUS', 'ZAAD', 'SAHAL', 'SALAAM_BANK', 'PREMIER_BANK'],
      index: true
    },

    // Display name for the provider
    displayName: {
      type: String,
      trim: true
    },

    // Merchant information
    merchantName: {
      type: String,
      trim: true
    },
    merchantNumber: {
      type: String,
      trim: true
    },
    merchantId: {
      type: String,
      trim: true
    },

    // API credentials (encrypted)
    apiKey: {
      type: String,
      trim: true,
      select: false
    },
    secretKey: {
      type: String,
      trim: true,
      select: false
    },
    clientId: {
      type: String,
      trim: true,
      select: false
    },
    clientSecret: {
      type: String,
      trim: true,
      select: false
    },

    // Webhook configuration
    webhookSecret: {
      type: String,
      trim: true,
      select: false
    },
    callbackUrl: {
      type: String,
      trim: true
    },

    // Environment
    environment: {
      type: String,
      enum: ['SANDBOX', 'PRODUCTION'],
      default: 'SANDBOX'
    },

    // Status
    isActive: {
      type: Boolean,
      default: true
    },
    isDefault: {
      type: Boolean,
      default: false
    },

    // Additional provider-specific configurations
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for efficient queries
paymentSettingsSchema.index({ tenant: 1, provider: 1 }, { unique: true });
paymentSettingsSchema.index({ tenant: 1, isActive: 1 });
paymentSettingsSchema.index({ tenant: 1, isDefault: 1 });

const PaymentSettings = mongoose.model('PaymentSettings', paymentSettingsSchema);
export default PaymentSettings;
