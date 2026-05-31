import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const accessSecret = () => process.env.JWT_SECRET;
const refreshSecret = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

/**
 * Short-lived access token — include tokenVersion for logout / password-change invalidation.
 */
export const generateAccessToken = (user) => {
  const schoolId = user.school?._id || user.school || null;
  const tenantId =
    user.school?.subdomain ||
    (typeof user.tenantId === 'string' ? user.tenantId : null);

  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      schoolId,
      tenantId,
      type: 'access',
      tv: user.tokenVersion ?? 0,
    },
    accessSecret(),
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m', jwtid: crypto.randomBytes(16).toString('hex') }
  );
};

/**
 * Refresh token — minimal claims; validate user + tv in DB on refresh.
 */
export const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      type: 'refresh',
      tv: user.tokenVersion ?? 0,
    },
    refreshSecret(),
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d', jwtid: crypto.randomBytes(16).toString('hex') }
  );
};

export const verifyRefreshToken = (token) =>
  jwt.verify(token, refreshSecret());

export const setTokenCookies = (res, refreshToken) => {
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge,
  });
};

export const clearRefreshCookie = (res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
};
