import mongoose from 'mongoose';

const channelProviderSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    providerKey: { type: String, required: true, index: true }, // e.g., 'twilio_sms', 'africastalking_sms', 'meta_whatsapp', 'ses'
    providerType: { type: String, required: true },
    config: { type: mongoose.Schema.Types.Mixed }, // encrypted config blob
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

channelProviderSchema.index({ tenantId: 1, providerKey: 1 });

const ChannelProvider = mongoose.model('ChannelProvider', channelProviderSchema);
export default ChannelProvider;
