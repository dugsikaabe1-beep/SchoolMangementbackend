import ErrorLog from '../models/ErrorLog.js';

export const logError = async (req, res) => {
  try {
    const { message, stack, url, metadata, type, severity } = req.body;
    
    await ErrorLog.create({
      tenantId: req.tenantId || 'platform',
      userId: req.user?._id,
      type: type || 'frontend',
      message,
      stack,
      url,
      userAgent: req.headers['user-agent'],
      metadata,
      severity: severity || 'medium'
    });

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('[ErrorLog] Failed to log error:', error);
    res.status(500).json({ success: false });
  }
};

export const getErrorLogs = async (req, res) => {
  try {
    const { status, type, severity, page = 1, limit = 50 } = req.query;
    const query = { isDeleted: false };
    
    if (status) query.status = status;
    if (type) query.type = type;
    if (severity) query.severity = severity;

    const logs = await ErrorLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('userId', 'name email school');

    const total = await ErrorLog.countDocuments(query);

    res.json({
      success: true,
      data: logs,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('[ErrorLog] Failed to fetch logs:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch error logs' });
  }
};

export const updateErrorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const log = await ErrorLog.findByIdAndUpdate(id, { status }, { new: true });
    
    if (!log) {
      return res.status(404).json({ success: false, message: 'Log not found' });
    }

    res.json({ success: true, data: log });
  } catch (error) {
    console.error('[ErrorLog] Failed to update status:', error);
    res.status(500).json({ success: false, message: 'Failed to update log status' });
  }
};