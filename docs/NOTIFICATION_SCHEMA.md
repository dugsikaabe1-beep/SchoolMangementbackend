# Notification Center: DB Schema & API Design

This document outlines the proposed database schema, primary models, indexes, and API endpoints for the Unified Communication / Notification Center upgrade.

Goals
- Tenant-aware and branch-aware notifications (no cross-school/branch leakage)
- Multi-channel (in_app, email, sms, whatsapp, push)
- Delivery tracking per channel (sent, delivered, opened/read, failed, bounced)
- Scheduling and recurring messages
- Template management with multi-language support
- RBAC enforcement and auditability

Primary Models

1) Notification
- Purpose: Stores an in-app notification and references to delivery logs for other channels.
- Fields:
  - _id
  - tenantId: ObjectId (ref `School` or tenant collection) — required, index
  - school: ObjectId (ref `School`) — required, index
  - branch: ObjectId (ref `Branch`) — nullable, index
  - recipients: [{ type: String, enum: ['user','group'] , id: ObjectId or groupId }] — allows targeted lists
  - title: String
  - message: String
  - messageType: String enum (attendance, finance, exam, general, etc.)
  - channels: [String] enum ['in_app','email','sms','whatsapp','push']
  - metadata: Mixed — freeform payload for client actions
  - templateCode: String — optional
  - language: String (e.g., 'en','so','ar')
  - priority: String enum ['low','normal','high','urgent']
  - readBy: [{ userId, readAt }] — for unread counters
  - status: String enum ['created','queued','processing','completed','failed']
  - deliverySummary: { total: Number, sent: Number, delivered: Number, failed: Number, opened: Number }
  - scheduling: { sendAt: Date, timezone: String, recurring: { rule: String } }
  - createdBy, updatedBy, timestamps

Indexes: `{ tenantId:1, school:1, branch:1, createdAt: -1 }`, `{ status:1, sendAt:1 }`, text index on `title` and `message`.

2) DeliveryLog
- Purpose: Track per-channel delivery attempts and statuses.
- Fields:
  - _id
  - notificationId: ObjectId (ref Notification) — index
  - tenantId, school, branch
  - channel: enum ['email','sms','whatsapp','push']
  - provider: String (e.g., 'twilio','africastalking','twilio_whatsapp','meta_whatsapp','ses','mailgun','sendgrid','fcm','apns')
  - providerMessageId: String — id returned by provider
  - to: { phone, email, userId }
  - status: enum ['queued','sent','delivered','opened','failed','bounced']
  - attempt: Number
  - response: Mixed — raw provider response
  - timestamps (sentAt, deliveredAt, openedAt, failedAt)

Indexes: `{ notificationId:1 }`, `{ providerMessageId:1 }`, `{ tenantId:1, school:1 }`

3) NotificationTemplate & NotificationTemplateTranslation
- Purpose: Reusable templates; translations stored separately or embedded.
- Fields (Template): name, code, category, defaultSubject, defaultBody, placeholders[], type, isSystem, isActive, school/tenant, createdBy
- Fields (Translation): templateId, language, subject, body

4) ScheduledJob (optional) / SchedulerRecord
- Purpose: Persist scheduled & recurring tasks for reliability and recovery.
- Fields: notificationId, nextRunAt, recurrenceRule (iCal/RRule), timezone, status

5) ChannelProvider (configuration)
- Purpose: Store provider configs per tenant/school/branch (allows different schools to use different providers)
- Fields: tenantId, schoolId (optional), providerKey, providerType, config (encrypted), isActive

6) NotificationAudit / EventLog
- Purpose: Auditing who sent/edited/queued/cancelled notifications for compliance and RBAC.

Recipient Groups / Targeting
- Support explicit lists of userIds and high-level groups:
  - All Students (filter by role + school + branch + class/section)
  - Selected Students (list of userIds)
  - All Teachers / Selected Teachers
  - All Parents / Selected Parents
  - Entire Branch / Selected Branches
  - Entire School
  - Selected Classes / Sections

Implementation: implement server-side expansion of groups into userId lists at queue-time; store resulting recipient count and sample recipients in `Notification` for auditing.

API Endpoints (examples)
- POST /api/notifications/send — create & send now or schedule (body includes target, channels, templateCode or raw message, sendAt, recurrence)
- GET /api/notifications/{id} — view notification and delivery summary
- GET /api/notifications — list (with filters tenantId, school, branch, status, channel, recipient)
- POST /api/notifications/templates — CRUD templates
- GET /api/notifications/reports/summary — aggregated metrics
- GET /api/notifications/reports/channel-stats — per-channel analytics

Delivery Tracking & Webhooks
- Wire provider webhooks to update `DeliveryLog` and `Notification.deliverySummary`.
- Example: Twilio status callback updates providerMessageId -> status; Mailgun/Ses webhooks update email events (delivered, bounced, opened).

Scheduling & Worker Architecture
- Use a persistent queue (e.g., BullMQ/Redis) to enqueue channel-specific send jobs.
- Scheduler service reads `ScheduledJob` and enqueues jobs at proper times.
- Worker processes handle provider adapters and write `DeliveryLog` records.

Provider Abstraction Layer
- Implement a simple adapter interface:
  - send(payload): returns { providerMessageId, status }
  - parseWebhook(req): normalizes provider webhook payload
  - healthCheck()

Security & Multi-tenancy
- Enforce `tenantId` and `branchId` at every query/mutation via middleware.
- ChannelProvider configs must be encrypted; only accessible by Super Admin and School Admin (if allowed).

RBAC
- Super Admin: full access
- School Admin: full access within school (templates, providers, send)
- Branch Manager: create/send within branch scope
- Teacher: limited access — allowed to send to their classes or parents based on permissions

Analytics / Reporting
- Aggregate data from `DeliveryLog` and `Notification` for charts: total, sent, delivered, opened, failed, bounce rate, per-channel breakdown.
- Create time-series aggregates for last 7/30/90 days.

Migration Notes
- Add `tenantId` and `branch` indices to existing `Notification` and `NotificationTemplate` collections.
- Create `DeliveryLog` collection and backfill from `EmailLog` / `Notification` where applicable.

Next Steps
1. Implement new Mongoose models: `DeliveryLog`, `ScheduledJob`, `ChannelProvider`, `TemplateTranslation`.
2. Update `Notification` model to include tenant/branch fields, recipients array, scheduling fields, and deliverySummary.
3. Add migration scripts and tests.
4. Implement provider adapters and queue workers.

Reference: keep UI consistent with existing DugsiHub styles; API responses should avoid breaking existing clients.
