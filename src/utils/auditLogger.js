import AuditLog from '../models/AuditLog.js';
import useragent from 'useragent';

/**
 * Log a sensitive action to the audit trail
 */
export const logAction = (req, { action, module, details, targetId, oldValue, newValue }) => {
  // Use setImmediate to make it truly non-blocking
  setImmediate(async () => {
    try {
      const headers = req?.headers || {};
      const agent = useragent.parse(headers['user-agent'] || '');
      const device = agent.device.toString() !== 'Other 0.0.0' ? agent.device.toString() : agent.os.toString();

      await AuditLog.create({
        tenantId: req?.schoolId || req?.user?.school?._id || req?.user?.school || details?.school,
        schoolId: req?.schoolId || req?.user?.school?._id || req?.user?.school || details?.school,
        branchId: req?.branchId || req?.user?.branch?._id || req?.user?.branch || details?.branch,
        academicYearId: req?.academicYearId || details?.academicYearId,
        actorUserId: req?.user?._id || details?.actorUserId,
        action,
        targetType: module,
        moduleName: module,
        targetId: (targetId || details?.id || details?._id)?.toString(),
        oldValue,
        newValue,
        metadata: details,
        ipAddress: req?.ip || headers['x-forwarded-for'] || req?.connection?.remoteAddress,
        userAgent: headers['user-agent'],
        device
      });
    } catch (error) {
      console.error('[AuditLog] Error saving log:', error.message);
    }
  });
};

/**
 * Middleware to automatically log state-changing requests
 */
export const auditMiddleware = (moduleName) => {
  return async (req, res, next) => {
    // We only log successful state-changing operations
    const originalJson = res.json;
    res.json = function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300 && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        logAction(req, {
          action: `${req.method}_${req.path.split('/')[1].toUpperCase()}`,
          module: moduleName || 'SYSTEM',
          details: {
            method: req.method,
            path: req.path,
            body: req.method !== 'DELETE' ? req.body : undefined,
            params: req.params,
            query: req.query
          }
        });
      }
      return originalJson.call(this, data);
    };
    next();
  };
};
