import ApiActivityLog from '../models/ApiActivityLog.js';

export const apiActivityMiddleware = (req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    if (req.originalUrl?.startsWith('/api/health')) return;

    setImmediate(async () => {
      try {
        await ApiActivityLog.create({
          school: req.schoolId || req.user?.school?._id || req.user?.school,
          branch: req.branchId || req.user?.branch?._id || req.user?.branch,
          user: req.user?._id,
          method: req.method,
          endpoint: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
          requestTime: new Date(startedAt),
          ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
          userAgent: req.headers['user-agent'],
        });
      } catch (error) {
        console.error('[ApiActivity] Error saving log:', error.message);
      }
    });
  });

  next();
};
