// Simple in-memory rate limiter for email verification resends
const resendRateLimitStore = new Map();

// Rate limit: 1 resend per 2 minutes per email
const RESEND_WINDOW_MS = 2 * 60 * 1000;

export const rateLimitResendVerification = (req, res, next) => {
  const { email } = req.body;
  
  if (!email) {
    return next();
  }

  const now = Date.now();
  const lastRequest = resendRateLimitStore.get(email);

  if (lastRequest && now - lastRequest < RESEND_WINDOW_MS) {
    const timeLeft = Math.ceil((RESEND_WINDOW_MS - (now - lastRequest)) / 1000);
    return res.status(429).json({
      message: 'Too many resend requests',
      userMessage: `Please wait ${timeLeft} seconds before requesting a new verification email.`
    });
  }

  resendRateLimitStore.set(email, now);

  // Cleanup old entries after window expires
  setTimeout(() => {
    resendRateLimitStore.delete(email);
  }, RESEND_WINDOW_MS);

  next();
};
