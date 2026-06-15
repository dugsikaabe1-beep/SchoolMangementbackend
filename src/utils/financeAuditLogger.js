import FinanceAuditLog from '../models/FinanceAuditLog.js';

/**
 * Immutable finance audit trail for fee/payment changes.
 */
export const logFinanceAction = (req, payload) => {
  setImmediate(async () => {
    try {
      await FinanceAuditLog.create({
        tenantId: req.schoolId || req.user?.school,
        branchId: req.branchId || req.user?.branch,
        actorUserId: req.user?._id,
        ipAddress: req.ip || req.headers['x-forwarded-for'],
        ...payload,
      });
    } catch (error) {
      console.error('[FinanceAudit] Error saving log:', error.message);
    }
  });
};

export default logFinanceAction;
