# Email Deliverability Guide

Objective: improve email delivery for DugsiHub and reduce spam/failure rates by configuring SPF, DKIM, DMARC, and proper sender identity.

1) Use a verified sending domain
- Send emails from a domain you control (e.g., mail.dugsihub.com or transactions.yourschool.edu).
- Avoid using generic provider domains in `From` address.

2) SPF (Sender Policy Framework)
- Add a TXT DNS record to authorize your sending service IPs and providers.
- Example TXT record: `v=spf1 include:spf.protection.outlook.com include:sendgrid.net -all` (adjust per provider).

3) DKIM (DomainKeys Identified Mail)
- Configure DKIM keys for each sending provider (Mailgun, SendGrid, SES, etc.).
- Add the provided public key as a DNS TXT record under the selector the provider specifies.

4) DMARC (Domain-based Message Authentication, Reporting & Conformance)
- Create a DMARC policy to monitor and enforce email authentication.
- Example record: `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourdomain.com; ruf=mailto:dmarc-forensics@yourdomain.com; pct=100;`.

5) Use reputable transactional email providers
- Prefer SES, SendGrid, Mailgun, Postmark for transactional emails; they provide good deliverability and webhook events.

6) Implement bounce, complaint, and open tracking
- Use provider webhooks to capture delivered, bounced, opened, and complaint events and write to `DeliveryLog`.

7) Use separate subdomains for transactional and marketing email
- Helps isolate reputation and easier DNS management.

8) Verify reverse DNS (PTR) for dedicated IPs

9) Ensure email content quality
- Avoid spammy keywords, include plain-text part, and proper unsubscribe links for bulk emails.

10) Monitor with DMARC reports and provider dashboards

Resources
- AWS SES: https://docs.aws.amazon.com/ses/latest/DeveloperGuide/send-email-authentication-methods.html
- SendGrid: https://docs.sendgrid.com/ui/account-and-settings/how-to-set-up-domain-authentication
- Mailgun: https://documentation.mailgun.com/en/latest/user_manual.html#dns
