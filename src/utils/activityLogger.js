import AuditLog from '../models/AuditLog.js';
import useragent from 'useragent';

/**
 * Log a user activity for the timeline
 * Merged with existing AuditLog system
 */
export const logActivity = async ({
  schoolId,
  branchId,
  userId,
  action,
  module,
  targetId = null,
  description = '',
  metadata = {},
  req = null // Optional request object to extract IP and User Agent
}) => {
  try {
    const logData = {
      tenantId: schoolId,
      branchId: branchId,
      actorUserId: userId,
      action,
      moduleName: module,
      targetType: module,
      targetId: targetId?.toString(),
      description,
      metadata
    };

    if (req) {
      const agent = useragent.parse(req.headers['user-agent']);
      logData.device = agent.device.toString() !== 'Other 0.0.0' ? agent.device.toString() : agent.os.toString();
      logData.ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      logData.userAgent = req.headers['user-agent'];
    }

    await AuditLog.create(logData);
  } catch (error) {
    console.error('[ActivityLogger] Error logging activity:', error.message);
  }
};
