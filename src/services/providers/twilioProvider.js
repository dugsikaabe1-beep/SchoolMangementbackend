import axios from 'axios';

const getCredentials = (config = {}) => {
  const accountSid = config.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = config.authToken || process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken };
};

const sendTwilioMessage = async ({ to, from, body, config = {} }) => {
  const credentials = getCredentials(config);
  if (!credentials) throw new Error('Twilio not configured');
  if (!from) throw new Error('Twilio sender not configured');

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const response = await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
    params,
    {
      auth: {
        username: credentials.accountSid,
        password: credentials.authToken,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  return {
    providerMessageId: response.data?.sid,
    status: 'sent',
    response: response.data,
  };
};

export const sendSMS = async ({ to, body, config = {} }) => {
  const from = config.from || process.env.TWILIO_PHONE_FROM || process.env.TWILIO_FROM_NUMBER;
  return sendTwilioMessage({ to, from, body, config });
};

export const sendWhatsApp = async ({ to, body, config = {} }) => {
  const from = config.whatsappFrom || process.env.TWILIO_WHATSAPP_FROM;

  const formatWhatsappAddress = (value) => {
    if (!value) return value;
    return value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;
  };

  return sendTwilioMessage({
    body,
    to: formatWhatsappAddress(to),
    from: formatWhatsappAddress(from),
    config,
  });
};

export default { sendSMS, sendWhatsApp };
