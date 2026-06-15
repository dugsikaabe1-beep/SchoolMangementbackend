// Twilio provider adapter (stub)
import twilio from 'twilio';

const getClient = (config = {}) => {
  const accountSid = config.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = config.authToken || process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return twilio(accountSid, authToken);
};

export const sendSMS = async ({ to, body, config = {} }) => {
  const client = getClient(config);
  if (!client) throw new Error('Twilio not configured');
  const from = config.from || process.env.TWILIO_PHONE_FROM;
  const msg = await client.messages.create({ body, to, from });
  return { providerMessageId: msg.sid, status: 'sent', response: msg };
};

export default { sendSMS };
