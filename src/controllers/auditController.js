import AuditLog from '../models/AuditLog.js';
import FinanceAuditLog from '../models/FinanceAuditLog.js';

/**
 * GET /api/enterprise/audit-logs
 */
export const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      action,
      module: targetType,
      userId,
      startDate,
      endDate,
    } = req.query;

    const query = { tenantId: req.schoolId || req.user?.school };
    if (req.branchId) query.branchId = req.branchId;
    if (action) query.action = action;
    if (targetType) query.targetType = targetType;
    if (userId) query.actorUserId = userId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('actorUserId', 'name email role customId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/enterprise/finance-audit-logs
 */
export const getFinanceAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, targetId, startDate, endDate } = req.query;
    const query = { tenantId: req.schoolId || req.user?.school };
    if (req.branchId) query.branchId = req.branchId;
    if (action) query.action = action;
    if (targetId) query.targetId = targetId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      FinanceAuditLog.find(query)
        .populate('actorUserId', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      FinanceAuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default { getAuditLogs, getFinanceAuditLogs };
