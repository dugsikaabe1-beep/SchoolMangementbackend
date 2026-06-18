// FCM provider adapter (stub) for push notifications
// Use global fetch when available (Node 18+). Fall back to dynamic import of node-fetch.
let fetchFn;
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

export const sendPush = async ({ token, title, body, data }) => {
  const serverKey = (data && data._providerConfig && data._providerConfig.serverKey) || process.env.FCM_SERVER_KEY;
  if (!serverKey) throw new Error('FCM server key not configured');
  const res = await fetchFn('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `key=${serverKey}`
    },
    body: JSON.stringify({ to: token, notification: { title, body }, data })
  });
  const json = await res.json();
  return { providerMessageId: json?.results?.[0]?.message_id || json?.message_id, status: 'sent', response: json };
};

export default { sendPush };
