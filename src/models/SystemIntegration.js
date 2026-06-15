import mongoose from 'mongoose';

const systemIntegrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g., "WhatsApp Business API", "Twilio SMS"
    provider: { type: String, required: true }, // e.g., "Meta", "Twilio", "Stripe"
    category: { 
      type: String, 
      enum: ['whatsapp', 'sms', 'email', 'payment_gateway', 'government', 'other'], 
      required: true 
    },
    config: { type: mongoose.Schema.Types.Mixed }, // API keys, endpoints, etc.
    isEnabled: { type: Boolean, default: false },
    environment: { 
      type: String, 
      enum: ['development', 'staging', 'production'], 
      default: 'production' 
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const SystemIntegration = mongoose.model('SystemIntegration', systemIntegrationSchema);
export default SystemIntegration;
