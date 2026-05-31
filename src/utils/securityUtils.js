/**
 * Escape user-controlled strings before embedding in RegExp (ReDoS / injection hardening).
 */
export const escapeRegex = (value) => {
  if (value == null || typeof value !== 'string') return '';
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Subdomain label validation (RFC-ish, DNS-safe).
 */
export const isValidSubdomainLabel = (label) =>
  typeof label === 'string' &&
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) &&
  !label.includes('..');

export const securityLog = (event, meta = {}) => {
  console.warn(
    JSON.stringify({
      ts: new Date().toISOString(),
      channel: 'security',
      event,
      ...meta,
    })
  );
};
