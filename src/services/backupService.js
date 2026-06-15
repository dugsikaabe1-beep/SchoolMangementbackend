import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import BackupRecord from '../models/BackupRecord.js';
import School from '../models/School.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const BACKUP_DIR = path.join(__dirname, '../../backups');

const TENANT_COLLECTIONS = [
  'users',
  'classes',
  'subjects',
  'attendances',
  'exams',
  'marks',
  'monthlypayments',
  'paymentmonths',
  'schedules',
  'academicyears',
  'announcements',
  'documents',
  'notifications',
  'auditlogs',
  'financeauditlogs',
  'promotionhistories',
];

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

export async function createTenantBackup(mongoose, { tenantId, branchId, createdBy, label }) {
  await ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup-${tenantId}${branchId ? `-${branchId}` : ''}-${timestamp}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);
  const db = mongoose.connection.db;
  const payload = {
    meta: {
      tenantId: tenantId.toString(),
      branchId: branchId?.toString() || null,
      createdBy: createdBy?.toString() || null,
      label: label || 'manual',
      createdAt: new Date().toISOString(),
      version: 1,
    },
    collections: {},
  };

  for (const collectionName of TENANT_COLLECTIONS) {
    const collection = db.collection(collectionName);
    const query = {
      $or: [
        { school: tenantId },
        { tenant: tenantId },
        { tenantId },
      ],
    };
    if (branchId) {
      query.branch = branchId;
    }
    const docs = await collection.find(query).limit(10000).toArray();
    if (docs.length) payload.collections[collectionName] = docs;
  }

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  const stat = await fs.stat(filePath);

  const recordCount = Object.values(payload.collections).reduce((sum, arr) => sum + arr.length, 0);

  const backupRecord = await BackupRecord.create({
    tenantId,
    branchId: branchId || undefined,
    fileName,
    sizeBytes: stat.size,
    label: label || 'manual',
    recordCount,
    status: 'success',
    createdBy: createdBy || undefined,
  });

  return {
    _id: backupRecord._id,
    fileName,
    filePath,
    sizeBytes: stat.size,
    collectionCount: Object.keys(payload.collections).length,
    recordCount,
    meta: payload.meta,
  };
}

export const scheduleAllTenantBackups = (mongoose) => {
  // Daily backup at 01:00 AM
  cron.schedule('0 1 * * *', async () => {
    console.log('[BackupService] Starting daily automated backups...');
    try {
      const activeSchools = await School.find({ isActive: true });
      for (const school of activeSchools) {
        try {
          await createTenantBackup(mongoose, { tenantId: school._id, label: 'daily' });
          console.log(`[BackupService] Daily backup successful for school: ${school.name}`);
        } catch (err) {
          console.error(`[BackupService] Daily backup failed for school ${school.name}:`, err);
        }
      }
    } catch (error) {
      console.error('[BackupService] Automated daily backup error:', error);
    }
  });

  // Weekly backup at Sunday 02:00 AM
  cron.schedule('0 2 * * 0', async () => {
    console.log('[BackupService] Starting weekly automated backups...');
    try {
      const activeSchools = await School.find({ isActive: true });
      for (const school of activeSchools) {
        try {
          await createTenantBackup(mongoose, { tenantId: school._id, label: 'weekly' });
          console.log(`[BackupService] Weekly backup successful for school: ${school.name}`);
        } catch (err) {
          console.error(`[BackupService] Weekly backup failed for school ${school.name}:`, err);
        }
      }
    } catch (error) {
      console.error('[BackupService] Automated weekly backup error:', error);
    }
  });
  console.log('[BackupService] Automated backup cron tasks scheduled.');
}

export async function listTenantBackups(tenantId) {
  await ensureBackupDir();
  const files = await fs.readdir(BACKUP_DIR);
  const tenantPrefix = `backup-${tenantId}`;
  const backups = [];

  for (const file of files) {
    if (!file.startsWith(tenantPrefix) || !file.endsWith('.json')) continue;
    const filePath = path.join(BACKUP_DIR, file);
    const stat = await fs.stat(filePath);
    backups.push({
      fileName: file,
      sizeBytes: stat.size,
      createdAt: stat.mtime,
    });
  }

  return backups.sort((a, b) => b.createdAt - a.createdAt);
}

export async function restoreTenantBackup(mongoose, { fileName, tenantId, dryRun = true }) {
  const filePath = path.join(BACKUP_DIR, fileName);
  const raw = await fs.readFile(filePath, 'utf8');
  const payload = JSON.parse(raw);

  if (payload.meta?.tenantId !== tenantId.toString()) {
    throw new Error('Backup tenant mismatch');
  }

  if (dryRun) {
    return {
      dryRun: true,
      meta: payload.meta,
      collections: Object.fromEntries(
        Object.entries(payload.collections).map(([name, docs]) => [name, docs.length])
      ),
    };
  }

  const db = mongoose.connection.db;
  const restored = {};

  for (const [collectionName, docs] of Object.entries(payload.collections)) {
    if (!docs?.length) continue;
    const collection = db.collection(collectionName);
    for (const doc of docs) {
      await collection.replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
    restored[collectionName] = docs.length;
  }

  return { dryRun: false, restored, meta: payload.meta };
}

/**
 * Verify backup integrity
 */
export async function verifyBackup(fileName) {
  try {
    const filePath = path.join(BACKUP_DIR, fileName);
    const raw = await fs.readFile(filePath, 'utf8');
    const payload = JSON.parse(raw);

    // Basic structure check
    if (!payload.meta || !payload.collections) {
      throw new Error('Invalid backup structure');
    }

    const recordCount = Object.values(payload.collections).reduce((sum, arr) => sum + arr.length, 0);
    
    // Integrity Score (Example: 100 if all expected collections have data, or based on counts)
    const integrityScore = payload.meta.version === 1 ? 100 : 0;

    await BackupRecord.findOneAndUpdate(
      { fileName },
      { 
        status: 'verified',
        verificationReport: {
          verifiedAt: new Date(),
          integrityScore,
          errors: []
        }
      }
    );

    return { 
      success: true, 
      recordCount, 
      integrityScore,
      meta: payload.meta 
    };
  } catch (error) {
    await BackupRecord.findOneAndUpdate(
      { fileName },
      { 
        status: 'integrity_error',
        verificationReport: {
          verifiedAt: new Date(),
          integrityScore: 0,
          errors: [error.message]
        }
      }
    );
    throw error;
  }
}

export default {
  createTenantBackup,
  listTenantBackups,
  restoreTenantBackup,
  scheduleAllTenantBackups,
  verifyBackup,
  BACKUP_DIR,
};
