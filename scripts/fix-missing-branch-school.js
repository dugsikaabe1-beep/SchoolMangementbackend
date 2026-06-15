import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to scripts folder
dotenv.config({ path: path.join(__dirname, '../.env') });

import School from '../src/models/School.js';
import Branch from '../src/models/Branch.js';
import User from '../src/models/User.js';
import Class from '../src/models/Class.js';
import Subject from '../src/models/Subject.js';
import Attendance from '../src/models/Attendance.js';
import Exam from '../src/models/Exam.js';
import Mark from '../src/models/Mark.js';
import MonthlyPayment from '../src/models/MonthlyPayment.js';
import Schedule from '../src/models/Schedule.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function getOrCreateMainBranch(schoolId) {
  let branch = await Branch.findOne({ 
    tenant: schoolId, 
    status: 'active', 
    deletedAt: { $exists: false },
    $or: [{ name: 'Main Branch' }, { code: 'MAIN' }]
  }).sort({ createdAt: 1 });

  if (!branch) {
    branch = await Branch.findOne({ tenant: schoolId, status: 'active', deletedAt: { $exists: false } }).sort({ createdAt: 1 });
  }

  if (!branch && !DRY_RUN) {
    branch = await Branch.create({
      tenant: schoolId,
      name: 'Main Branch',
      code: 'MAIN',
      status: 'active'
    });
  }

  return branch ? branch._id : null;
}

async function fixCollection(Model, modelName) {
  console.log(`\n--- Auditing ${modelName} ---`);
  
  // Find records missing branch but having school
  const missingBranch = await Model.find({ 
    school: { $exists: true, $ne: null },
    $or: [
      { branch: { $exists: false } },
      { branch: null }
    ]
  });

  console.log(`Found ${missingBranch.length} ${modelName} records missing branch ID.`);

  if (missingBranch.length === 0) return;

  // Group by school to minimize Branch lookups
  const recordsBySchool = {};
  for (const record of missingBranch) {
    const schoolId = record.school.toString();
    if (!recordsBySchool[schoolId]) {
      recordsBySchool[schoolId] = [];
    }
    recordsBySchool[schoolId].push(record._id);
  }

  let patchedCount = 0;
  for (const [schoolId, recordIds] of Object.entries(recordsBySchool)) {
    const mainBranchId = await getOrCreateMainBranch(schoolId);
    
    if (mainBranchId) {
      if (!DRY_RUN) {
        const result = await Model.updateMany(
          { _id: { $in: recordIds } },
          { $set: { branch: mainBranchId } }
        );
        patchedCount += result.modifiedCount;
      } else {
        patchedCount += recordIds.length;
      }
    } else {
      console.warn(`Could not find or create a Main Branch for School ${schoolId}`);
    }
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would have patched ${patchedCount} ${modelName} records.`);
  } else {
    console.log(`Successfully patched ${patchedCount} ${modelName} records.`);
  }
}

async function main() {
  try {
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log(`Connected to MongoDB.`);
    
    if (DRY_RUN) {
      console.log(`\n!!! RUNNING IN DRY RUN MODE - NO CHANGES WILL BE SAVED !!!\n`);
    }

    await fixCollection(User, 'User (Students/Teachers)');
    await fixCollection(Class, 'Class');
    await fixCollection(Subject, 'Subject');
    await fixCollection(Attendance, 'Attendance');
    await fixCollection(Exam, 'Exam');
    await fixCollection(Mark, 'Mark');
    await fixCollection(MonthlyPayment, 'MonthlyPayment');
    await fixCollection(Schedule, 'Schedule');

    console.log(`\nMigration completed successfully.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
