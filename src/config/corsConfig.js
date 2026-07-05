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
      return [
        /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?$/i,
        /\.vercel\.app$/i,
        /dugsihub-lilac\.vercel\.app$/i
      ];
  }

  return raw.split(',').map((s) => s.trim()).filter(Boolean).map((entry) => {
    if (entry.toLowerCase().startsWith('regex:')) {
      const pattern = entry.slice(6);
      try {
        return new RegExp(pattern);
      } catch (e) {
        console.error(`Invalid CORS regex pattern: ${pattern}`, e);
        return null;
      }
    }
    return entry;
  }).filter(Boolean);
};

export const originMatcher = (allowed) => (origin, callback) => {
  // 1. Allow non-browser clients (curl, mobile native)
  if (!origin) {
    return callback(null, true);
  }

  // 2. Match against the allowed list
  const ok = allowed.some((rule) => {
    if (rule instanceof RegExp) {
      return rule.test(origin);
    }
    return rule === origin;
  });
  
  if (ok) return callback(null, true);

  // 3. In development, be more permissive with common dev domains if not explicitly matched
  if (process.env.NODE_ENV === 'development') {
      if (origin.startsWith('https://schoolmangementbackend-deployment.up.railway.app') || origin.startsWith('https://schoolmangementbackend-deployment.up.railway.app') || origin.includes('vercel.app')) {
      return callback(null, true);
    }
  }
  
  console.warn(`[CORS] Blocked origin: ${origin}. If this should be allowed, add it to CORS_ALLOWED_ORIGINS in .env`);
  return callback(new Error('CORS Policy Violation: Origin not allowed'));
};
