// OneSignal provider adapter for web push notifications
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

export const sendWebPush = async ({ playerId, title, body, data, config }) => {
  if (!fetchFn) await initFetch();
  const appId = config.appId || process.env.ONESIGNAL_APP_ID;
  const restApiKey = config.restApiKey || process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !restApiKey) throw new Error('OneSignal app ID or REST API key not configured');

  const res = await fetchFn('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${restApiKey}`
    },
    body: JSON.stringify({
      app_id: appId,
      include_player_ids: [playerId],
      headings: { en: title },
      contents: { en: body },
      data
    })
  });
  const json = await res.json();
  return { 
    providerMessageId: json?.id, 
    status: json?.errors ? 'failed' : 'sent', 
    response: json 
  };
};

export default { sendWebPush };
