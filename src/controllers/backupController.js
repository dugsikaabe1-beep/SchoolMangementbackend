import {
  createTenantBackup,
  listTenantBackups,
  restoreTenantBackup,
  verifyBackup as verifyBackupService,
} from '../services/backupService.js';
import mongoose from 'mongoose';
import { logAction } from '../utils/auditLogger.js';

export const createBackup = async (req, res) => {
  try {
    const tenantId = req.schoolId || req.user?.school;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant context required' });
    }

    const backup = await createTenantBackup(mongoose, {
      tenantId,
      branchId: req.branchId,
      createdBy: req.user._id,
      label: req.body?.label || 'manual',
    });

    logAction(req, {
      action: 'BACKUP_CREATE',
      module: 'BACKUP',
      details: { fileName: backup.fileName, recordCount: backup.recordCount },
    });

    res.status(201).json({ success: true, data: backup });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getBackups = async (req, res) => {
  try {
    const tenantId = req.schoolId || req.user?.school;
    const backups = await listTenantBackups(tenantId);
    res.json({ success: true, data: backups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const restoreBackup = async (req, res) => {
  try {
    const tenantId = req.schoolId || req.user?.school;
    const { fileName, confirm } = req.body;
    if (!fileName) {
      return res.status(400).json({ success: false, message: 'fileName is required' });
    }

    const dryRun = confirm !== true;
    const result = await restoreTenantBackup(mongoose, {
      fileName,
      tenantId,
      dryRun,
    });

    if (!dryRun) {
      logAction(req, {
        action: 'BACKUP_RESTORE',
        module: 'BACKUP',
        details: { fileName, restored: result.restored },
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const verifyBackup = async (req, res) => {
  try {
    const { fileName } = req.params;
    const result = await verifyBackupService(fileName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export default { createBackup, getBackups, restoreBackup, verifyBackup };
