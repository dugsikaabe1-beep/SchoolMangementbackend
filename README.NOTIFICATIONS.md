# Notification Center: Developer Notes

Quick start for running the notification worker locally (development):

1. Ensure environment variables are set for at least one provider (or rely on stubs):

```powershell
# Example env (PowerShell)
$env:TWILIO_ACCOUNT_SID = 'your-sid'
$env:TWILIO_AUTH_TOKEN = 'your-token'
$env:TWILIO_PHONE_FROM = '+1234567890'

$env:FCM_SERVER_KEY = 'your-fcm-key'

# Or for Meta WhatsApp
$env:META_WHATSAPP_TOKEN = 'your-token'
$env:META_WHATSAPP_PHONE_NUMBER_ID = 'your-phone-number-id'
```

2. Start the app as usual (from `backend/`):

```powershell
# install deps
npm install
# start (development)
npm run dev
```

3. Run worker manually (node REPL or create a small runner):

```powershell
node -e "require('./src/services/notificationWorker.js').processQueuedDeliveries(50).then(n=>console.log('Processed',n)).catch(console.error)"
```

Notes:
- The worker and provider adapters are stubs; replace with production-grade adapters and robust retry/error handling.
- Retry policy: worker will attempt queued deliveries up to 3 times before marking them failed.
- Webhook endpoint: POST `/api/v1/notifications/webhooks/provider-event` accepts `{ provider, providerMessageId, status, details }`.
- Templates, scheduling, RBAC, analytics and mobile client badge sync are next steps.