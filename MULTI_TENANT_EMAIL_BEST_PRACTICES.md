# Multi-Tenant School ERP: Email Verification Best Practices

## 1. Security First

### Token Generation
- Use cryptographically secure random tokens (minimum 32 bytes)
- Never use sequential IDs or predictable values
- Use `crypto.randomBytes()` in Node.js

### Token Storage
- Store a hash of the token in the database if tokens are long-lived (optional, but recommended)
- Always store token expiration times alongside tokens
- Immediately invalidate tokens after use

### Token Expiration
- Short expiration times (10-15 minutes) for one-time use tokens
- Never allow expired tokens to be used
- Log token expiration attempts for monitoring

## 2. Reliability & Delivery

### Fail Fast
- Never return success to the user unless the email is successfully accepted by the SMTP server
- Roll back any database changes (like user creation) if email delivery fails
- Provide clear error messages to the user

### Email Service Selection
- For production, use a dedicated email service provider (ESP) like:
  - SendGrid
  - Brevo (Sendinblue)
  - AWS SES
  - Mailgun
- Gmail SMTP is okay for development but not recommended for production (rate limits, deliverability issues)

### Monitoring & Alerts
- Log all email delivery attempts (success/failure)
- Set up alerts for high email failure rates
- Monitor bounce rates and spam complaints

## 3. Rate Limiting

### Why Rate Limiting?
- Prevent abuse of your email system
- Avoid hitting ESP rate limits
- Protect against denial-of-service attacks

### Implementation
- Limit resend attempts per email address (e.g., 1 per 2 minutes)
- Use a distributed rate limiter in production (Redis, etc.)
- Return clear "too many requests" errors to users

## 4. Multi-Tenant Considerations

### Tenant Isolation
- All user data must be scoped by tenant ID
- When looking up users by email, include tenant ID in the query if applicable
- Never allow cross-tenant email verification attempts

### Tenant-Specific Configuration
- Allow different tenants to use different email "from" addresses
- Respect tenant-specific email branding
- Store tenant email preferences in your database

### Performance
- Use database indexes on email and token fields
- Consider pagination for any email-related admin dashboards
- Use connection pooling for SMTP connections

## 5. User Experience (UX)

### Clear Messaging
- Tell users exactly what to expect after signing up
- Provide instructions for checking spam folders
- Show a friendly error message if email delivery fails

### Verification Flow
- Simple, one-click verification links
- Don't require users to log in before verifying their email
- Auto-redirect to the login page after successful verification

### Resend Functionality
- Easy-to-find resend button
- Show countdown timer for rate limits
- Don't make users re-enter their email to resend

## 6. Compliance

### Privacy Laws
- Follow GDPR, CCPA, and other local privacy regulations
- Provide an easy way for users to unsubscribe from non-essential emails
- Keep records of consent for email communications

### Email Authentication
- Set up SPF, DKIM, and DMARC records for your domain
- Use a dedicated sending domain or subdomain
- Avoid using "noreply" addresses if users might need to reply

## 7. Testing

### Development
- Use tools like Mailtrap, Ethereal, or Nodemailer's test account
- Test both successful and failed email delivery scenarios
- Test rate limiting functionality

### Production
- Test with real email addresses from different providers (Gmail, Yahoo, Outlook, etc.)
- Check deliverability with tools like Mail-Tester
- Monitor email open and click-through rates

## 8. Maintenance & Monitoring

### Log Retention
- Keep audit logs for compliance and debugging
- Don't log sensitive information (passwords, full tokens)
- Have a log retention policy in place

### Updates
- Keep your email service dependencies up to date
- Stay informed about changes to your ESP's API
- Regularly review your email templates for compliance

## Summary

By following these best practices, you'll build an email verification system that's:
- ✅ Secure
- ✅ Reliable
- ✅ Scalable for multiple tenants
- ✅ User-friendly
- ✅ Compliant with regulations
