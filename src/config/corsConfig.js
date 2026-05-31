/**
 * CORS allow-list from environment.
 * Set CORS_ALLOWED_ORIGINS to a comma-separated list of:
 * - Exact origins: https://app.example.com
 * - Regex entries: regex:^https:\\/\\/[a-z0-9-]+\\.example\\.com$
 *
 * If unset in development, localhost with any port is allowed.
 */
export const parseAllowedOrigins = () => {
  const raw = (process.env.CORS_ALLOWED_ORIGINS || '').trim();

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        'CORS_ALLOWED_ORIGINS is not set. Refusing to start with open CORS in production.'
      );
      return null;
    }
    return [/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?$/i];
  }

  return raw.split(',').map((s) => s.trim()).filter(Boolean).map((entry) => {
    if (entry.toLowerCase().startsWith('regex:')) {
      const pattern = entry.slice(6);
      return new RegExp(pattern);
    }
    return entry;
  });
};

export const originMatcher = (allowed) => (origin, callback) => {
  if (!origin) {
    // Non-browser clients (curl, mobile native) — tenant is still derived from Host, not Origin.
    return callback(null, true);
  }
  const ok = allowed.some((rule) =>
    rule instanceof RegExp ? rule.test(origin) : rule === origin
  );
  if (ok) return callback(null, true);
  return callback(new Error('CORS Policy Violation: Origin not allowed'));
};
