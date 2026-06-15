// FCM provider adapter (stub) for push notifications
import fetch from 'node-fetch';

export const sendPush = async ({ token, title, body, data }) => {
  const serverKey = (data && data._providerConfig && data._providerConfig.serverKey) || process.env.FCM_SERVER_KEY;
  if (!serverKey) throw new Error('FCM server key not configured');
  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
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
