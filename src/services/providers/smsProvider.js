// SMS provider adapter (supports multiple SMS gateways)
let fetchFn;
const initFetch = async () => {
  if (typeof fetch !== 'undefined') {
    fetchFn = fetch;
  } else {
    try {
      const nf = await import('node-fetch');
      fetchFn = nf.default || nf;
    } catch (e) {
      throw new Error('Fetch API is not available. Please install node-fetch or upgrade Node.js');
    }
  }
};

const supportedProviders = {
  twilio: async ({ to, message, config }) => {
    // Twilio implementation
    const accountSid = config.accountSid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = config.authToken || process.env.TWILIO_AUTH_TOKEN;
    const from = config.senderId || process.env.TWILIO_FROM;
    if (!accountSid || !authToken || !from) throw new Error('Twilio credentials not configured');
    // This is a stub - in real use, you'd use the twilio npm package
    console.log('[SMSProvider] Twilio stub - would send SMS');
    return { providerMessageId: `twilio_${Date.now()}`, status: 'sent' };
  },
  africastalking: async ({ to, message, config }) => {
    if (!fetchFn) await initFetch();
    const apiKey = config.apiKey || process.env.AFRICASTALKING_API_KEY;
    const username = config.username || process.env.AFRICASTALKING_USERNAME;
    const from = config.senderId || process.env.AFRICASTALKING_FROM;
    if (!apiKey || !username || !from) throw new Error('AfricasTalking credentials not configured');
    const res = await fetchFn('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': apiKey
      },
      body: new URLSearchParams({
        username,
        to,
        message,
        from
      })
    });
    const json = await res.json();
    return { 
      providerMessageId: json?.SMSMessageData?.Recipients?.[0]?.messageId, 
      status: json?.SMSMessageData?.Recipients?.[0]?.statusCode === 101 ? 'sent' : 'failed', 
      response: json 
    };
  },
  generic: async ({ to, message, config }) => {
    if (!fetchFn) await initFetch();
    const endpoint = config.endpoint;
    const headers = config.headers || {};
    const body = config.bodyTemplate ? config.bodyTemplate.replace('{to}', to).replace('{message}', message) : { to, message };
    if (!endpoint) throw new Error('Generic SMS provider endpoint not configured');
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });
    const json = await res.json();
    return { providerMessageId: null, status: 'sent', response: json };
  }
};

export const sendSms = async ({ to, message, provider = 'generic', config = {} }) => {
  const sendFn = supportedProviders[provider];
  if (!sendFn) throw new Error(`Unsupported SMS provider: ${provider}`);
  return await sendFn({ to, message, config });
};

export default { sendSms };
