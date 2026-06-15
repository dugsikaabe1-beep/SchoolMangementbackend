import AuditLog from '../models/AuditLog.js';

/**
 * GET /api/enterprise/activity-feed
 * Centralized activity center sourced from audit logs.
 */
export const getActivityFeed = async (req, res) => {
  try {
    const { page = 1, limit = 30, action, module: targetType } = req.query;
    const query = { tenantId: req.schoolId || req.user?.school };
    if (req.branchId) query.branchId = req.branchId;
    if (action) query.action = action;
    if (targetType) query.targetType = targetType;

    const skip = (Number(page) - 1) * Number(limit);
    const [activities, total] = await Promise.all([
      AuditLog.find(query)
        .populate('actorUserId', 'name role customId profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: activities.map((item) => ({
        id: item._id,
        action: item.action,
        module: item.targetType,
        targetId: item.targetId,
        details: item.metadata,
        user: item.actorUserId,
        branchId: item.branchId,
        timestamp: item.createdAt,
        ipAddress: item.ipAddress,
      })),
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

export default { getActivityFeed };
