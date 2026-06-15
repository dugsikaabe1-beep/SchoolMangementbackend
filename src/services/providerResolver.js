import ChannelProvider from '../models/ChannelProvider.js';
import { decryptConfig } from '../utils/crypto.js';

/**
 * Resolve the provider configuration for a given tenant/school and channel.
 * Falls back to environment-configured defaults if no ChannelProvider is set.
 */
export const resolveProvider = async ({ tenantId, schoolId, channel }) => {
  // Try to find a ChannelProvider configured for the school/tenant
  const provider = await ChannelProvider.findOne({ schoolId: schoolId, providerType: channel, isActive: true });
  if (provider) {
    try {
      const cfg = provider.config;
      provider.config = cfg && typeof cfg === 'string' ? decryptConfig(cfg) : cfg;
    } catch (e) {
      console.warn('[ProviderResolver] failed to decrypt provider config', e.message || e);
    }
    return provider;
  }

  // Fallbacks based on environment variables
  if (channel === 'sms') {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) return { providerKey: 'twilio_sms', providerType: 'sms' };
    if (process.env.AT_API_KEY && process.env.AT_USERNAME) return { providerKey: 'africastalking_sms', providerType: 'sms' };
  }

  if (channel === 'whatsapp') {
    if (process.env.META_WHATSAPP_TOKEN) return { providerKey: 'meta_whatsapp', providerType: 'whatsapp' };
  }

  if (channel === 'push') {
    if (process.env.FCM_SERVER_KEY) return { providerKey: 'fcm', providerType: 'push' };
  }

  return null;
};

export default { resolveProvider };
