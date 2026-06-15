// Meta / WhatsApp provider adapter (stub)
import axios from 'axios';

export const sendWhatsAppTemplate = async ({ to, templateName, components, token, config = {} }) => {
  // token can come from env or provider config
  const accessToken = token || config?.token || process.env.META_WHATSAPP_TOKEN;
  const phoneId = config?.phoneNumberId || process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneId) throw new Error('Meta WhatsApp not configured');
  // Example call (replace with real implementation)
  const url = `https://graph.facebook.com/v15.0/${phoneId}/messages`;
  const payload = { /* message payload */ };
  const res = await axios.post(url, payload, { headers: { Authorization: `Bearer ${accessToken}` } });
  return { providerMessageId: res.data?.messages?.[0]?.id, status: 'sent', response: res.data };
};

export default { sendWhatsAppTemplate };
