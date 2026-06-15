import Document from '../models/Document.js';
import { activeOnly, softDelete, restoreRecord } from '../utils/queryUtils.js';
import { logAction } from '../utils/auditLogger.js';

const buildScopeQuery = (req, extra = {}) => ({
  ...activeOnly(extra),
  school: req.schoolId || req.user?.school,
  ...(req.branchId ? { branch: req.branchId } : {}),
});

export const getDocuments = async (req, res) => {
  try {
    const { userId, type, status } = req.query;
    const query = buildScopeQuery(req);
    if (userId) query.user = userId;
    if (type) query.type = type;
    if (status) query.status = status;

    const documents = await Document.find(query)
      .populate('user', 'name customId role')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createDocument = async (req, res) => {
  try {
    const { title, type, user, file, expiryDate, status } = req.body;
    if (!title?.trim() || !file?.url) {
      return res.status(400).json({
        success: false,
        message: 'Title and file are required',
      });
    }

    const document = await Document.create({
      title: title.trim(),
      type: type || 'Other',
      user,
      file,
      expiryDate,
      status: status || 'Active',
      school: req.schoolId || req.user?.school,
      branch: req.branchId || req.user?.branch,
      createdBy: req.user._id,
    });

    logAction(req, {
      action: 'DOCUMENT_CREATE',
      module: 'DOCUMENTS',
      targetId: document._id,
      details: { title: document.title, type: document.type },
    });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const updateDocument = async (req, res) => {
  try {
    const document = await Document.findOne(buildScopeQuery(req, { _id: req.params.id }));
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const { title, type, file, expiryDate, status } = req.body;
    if (title !== undefined) document.title = title;
    if (type !== undefined) document.type = type;
    if (file !== undefined) document.file = file;
    if (expiryDate !== undefined) document.expiryDate = expiryDate;
    if (status !== undefined) document.status = status;
    document.updatedBy = req.user._id;
    await document.save();

    logAction(req, {
      action: 'DOCUMENT_UPDATE',
      module: 'DOCUMENTS',
      targetId: document._id,
    });

    res.json({ success: true, data: document });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const document = await Document.findOne(buildScopeQuery(req, { _id: req.params.id }));
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    await softDelete(Document, document._id, req.user._id);

    logAction(req, {
      action: 'DOCUMENT_DELETE',
      module: 'DOCUMENTS',
      targetId: document._id,
    });

    res.json({ success: true, message: 'Document archived successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const restoreDocument = async (req, res) => {
  try {
    const document = await restoreRecord(Document, req.params.id, req.user._id);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    res.json({ success: true, data: document });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export default {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  restoreDocument,
};
