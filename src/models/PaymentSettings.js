import mongoose from 'mongoose';
import { encryptConfig, decryptConfig } from '../utils/crypto.js';

/**
 * Payment Settings Model
 * Stores school-specific payment provider configurations.
 * Each school can have multiple payment providers enabled.
 * WaafiPay fields added — all existing fields preserved.
 */
const paymentSettingsSchema = new mongoose.Schema(
  {
    // ── Tenant isolation ─────────────────────────────────────────────────────
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },

    // ── Provider type ────────────────────────────────────────────────────────
    // WAAFIPAY added; all existing providers preserved
    provider: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      enum: ['EVC_PLUS', 'ZAAD', 'SAHAL', 'SALAAM_BANK', 'PREMIER_BANK', 'WAAFIPAY'],
      index: true
    },

    // ── Display metadata ─────────────────────────────────────────────────────
    displayName:   { type: String, trim: true },
    description:   { type: String, trim: true },

    // ── Generic merchant information (used by legacy providers) ───────────────
    merchantName:   { type: String, trim: true },
    merchantNumber: { type: String, trim: true },
    merchantId:     { type: String, trim: true },

    // ── Generic API credentials (encrypted) ──────────────────────────────────
    apiKey:      { type: String, trim: true, select: false },
    secretKey:   { type: String, trim: true, select: false },
    clientId:    { type: String, trim: true, select: false },
    clientSecret:{ type: String, trim: true, select: false },

    // ── WaafiPay-specific credentials (encrypted) ────────────────────────────
    // merchantUid  : WaafiPay Merchant UID
    // apiUserId    : WaafiPay API User ID
    // (apiKey      : WaafiPay API Key — reuses existing apiKey field)
    // storeId      : WaafiPay Store ID (plain, not secret)
    // hppKey       : WaafiPay HPP Key (encrypted)
    merchantUid: { type: String, trim: true },
    apiUserId:   { type: String, trim: true },
    storeId:     { type: String, trim: true },           // not secret
    hppKey:      { type: String, trim: true, select: false },

    // ── Webhook & callback ───────────────────────────────────────────────────
    webhookSecret: { type: String, trim: true, select: false },
    callbackUrl:   { type: String, trim: true },
    webhookUrl:    { type: String, trim: true },

    // ── Currency (ISO 4217) ──────────────────────────────────────────────────
    currency: { type: String, trim: true, uppercase: true, default: 'USD' },

    // ── Environment ─────────────────────────────────────────────────────────
    environment: {
      type: String,
      enum: ['SANDBOX', 'PRODUCTION'],
      default: 'SANDBOX'
    },

    // ── Status flags ─────────────────────────────────────────────────────────
    isActive:  { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    isEnabled: { type: Boolean, default: false }, // explicit on/off toggle

    // ── Arbitrary provider-specific config ───────────────────────────────────
    config: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Audit fields ─────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Encrypt secrets before saving
// Fields: apiKey, secretKey, clientId, clientSecret, webhookSecret (existing)
//         hppKey (WaafiPay)
// ─────────────────────────────────────────────────────────────────────────────
const ALL_SECRET_FIELDS = [
  'apiKey', 'secretKey', 'clientId', 'clientSecret', 'webhookSecret', 
  'hppKey'
];

paymentSettingsSchema.pre('save', function (next) {
  ALL_SECRET_FIELDS.forEach(field => {
    if (this.isModified(field) && this[field]) {
      try {
        this[field] = encryptConfig({ secret: this[field] });
      } catch (e) {
        console.error(`[PaymentSettings] Failed to encrypt ${field}:`, e.message);
      }
    }
  });
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Decrypt all secrets on demand (never exposed by default because select:false)
// ─────────────────────────────────────────────────────────────────────────────
paymentSettingsSchema.methods.getDecryptedSecrets = function () {
  const decrypted = {};
  ALL_SECRET_FIELDS.forEach(field => {
    if (this[field]) {
      try {
        const val = decryptConfig(this[field]);
        decrypted[field] = val?.secret ?? null;
      } catch (e) {
        console.error(`[PaymentSettings] Failed to decrypt ${field}:`, e.message);
        decrypted[field] = null;
      }
    } else {
      decrypted[field] = null;
    }
  });
  return decrypted;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a safe (no-secrets) settings object for API responses
// ─────────────────────────────────────────────────────────────────────────────
paymentSettingsSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  ALL_SECRET_FIELDS.forEach(f => delete obj[f]);
  return obj;
};

// ── Indexes ───────────────────────────────────────────────────────────────────
paymentSettingsSchema.index({ tenant: 1, provider: 1 }, { unique: true });
paymentSettingsSchema.index({ tenant: 1, isActive: 1 });
paymentSettingsSchema.index({ tenant: 1, isDefault: 1 });
paymentSettingsSchema.index({ tenant: 1, isEnabled: 1 });

const PaymentSettings = mongoose.model('PaymentSettings', paymentSettingsSchema);
export default PaymentSettings;
