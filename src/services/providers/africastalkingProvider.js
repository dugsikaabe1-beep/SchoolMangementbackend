// Africa's Talking provider adapter (stub)
import AfricasTalking from 'africastalking';

const getClient = (config = {}) => {
  const username = config.username || process.env.AT_USERNAME;
  const apiKey = config.apiKey || process.env.AT_API_KEY;
  if (!username || !apiKey) return null;
  return AfricasTalking({ apiKey, username });
};

export const sendSMS = async ({ to, body, config = {} }) => {
  const client = getClient(config);
  if (!client) throw new Error("Africa's Talking not configured");
  const sms = client.SMS;
  const res = await sms.send({ to, message: body, from: config.from || process.env.AT_FROM });
  return { providerMessageId: res, status: 'sent', response: res };
};

export default { sendSMS };
