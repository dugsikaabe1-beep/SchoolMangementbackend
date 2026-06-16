import mongoose from 'mongoose';

const communicationUsageSchema = new mongoose.Schema(
  {
    // TENANT & DATE
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    date: { type: Date, required: true, index: true },
    period: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
      default: 'daily'
    },

    // CHANNEL USAGE
    sms: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      cost: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' }
    },
    whatsapp: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      cost: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' }
    },
    email: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      cost: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' }
    },
    push: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      cost: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' }
    },

    // TOTALS
    totalMessages: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    totalCurrency: { type: String, default: 'USD' }
  },
  { timestamps: true }
);

// Compound index for unique usage records
communicationUsageSchema.index({ school: 1, date: 1, period: 1 }, { unique: true });
communicationUsageSchema.index({ school: 1, date: -1 });

const CommunicationUsage = mongoose.model('CommunicationUsage', communicationUsageSchema);
export default CommunicationUsage;
