import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Mark from '../models/Mark.js';
import Subject from '../models/Subject.js';
import Exam from '../models/Exam.js';
import School from '../models/School.js';
import Branch from '../models/Branch.js';
import mongoose from 'mongoose';
import { generateCustomId } from '../utils/schoolUtils.js';
import { logAction } from '../utils/auditLogger.js';
import { getCurrentAcademicYear } from '../utils/academicUtils.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function generateStudentId(schoolId) {
  return await generateCustomId('student', schoolId);
}

function generateRawPassword(name) {
  return `${name.split(' ')[0].toLowerCase()}${Math.floor(1000 + Math.random() * 9000)}`;
}

async function generateTeacherId(schoolId) {
  return await generateCustomId('teacher', schoolId);
}

function getObjectId(value) {
  if (!value) return null;
  return value._id || value.id || value;
}

async function parseWorkbook(buffer, mimetype) {
  const workbook = new ExcelJS.Workbook();
  if (mimetype === 'text/csv' || mimetype === 'application/vnd.ms-excel') {
    await workbook.csv.load(buffer);
  } else {
    await workbook.xlsx.load(buffer);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('No worksheet found in the uploaded file.');

  const rows = [];
  let headers = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = row.values.slice(1);
    if (rowNumber === 1) {
      headers = values.map((v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '_'));
    } else {
      const obj = {};
      headers.forEach((h, i) => {
        const cell = row.getCell(i + 1);
        let val = cell.value;
        if (val && typeof val === 'object' && val.text) val = val.text;
        if (val instanceof Date) val = val.toISOString().split('T')[0];
        obj[h] = val != null ? String(val).trim() : '';
      });
      obj.__rowNumber = rowNumber;
      rows.push(obj);
    }
  });
  return rows;
}

// ─── POST /api/admin/students/import ─────────────────────────────────────────

export const importStudents = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

  const schoolId = getObjectId(req.user.school || req.schoolId);
  if (!schoolId) return res.status(403).json({ success: false, message: 'School context not found.' });

  // Resolve branch ID
  let branchId = getObjectId(req.branchId || req.user.branch);
  
  if (!branchId) {
    // First try to find Main Branch by name or code
    let branch = await Branch.findOne({ 
      tenant: schoolId, 
      status: 'active', 
      deletedAt: { $exists: false },
      $or: [{ name: 'Main Branch' }, { code: 'MAIN' }]
    }).sort({ createdAt: 1 });

    // If no Main Branch found, get first active branch
    if (!branch) {
      branch = await Branch.findOne({ tenant: schoolId, status: 'active', deletedAt: { $exists: false } }).sort({ createdAt: 1 });
    }

    // If still no branch found, automatically create Main Branch
    if (!branch) {
      branch = await Branch.create({
        tenant: schoolId,
        name: 'Main Branch',
        code: 'MAIN',
        status: 'active',
        createdBy: req.user._id
      });
    }
    branchId = branch._id;
  }

  // Resolve academic year ID
  let academicYearId = req.academicYearId;
  if (!academicYearId) {
    const academicYear = await getCurrentAcademicYear(schoolId, branchId);
    if (!academicYear) {
      return res.status(400).json({
        success: false,
        message: 'No active academic year found. Please configure an academic year first.',
        userMessage: 'No active academic year found. Please configure an academic year first.',
      });
    }
    academicYearId = academicYear._id;
  }

  // credentialMode: 'auto' (default) or 'delayed'
  const credentialMode = req.body.credentialMode === 'delayed' ? 'delayed' : 'auto';
  // dryRun: parse & validate but do NOT persist — used for the preview step
  const dryRun = req.body.dryRun === 'true' || req.body.dryRun === true;

  let rows;
  try {
    rows = await parseWorkbook(req.file.buffer, req.file.mimetype);
  } catch (err) {
    return res.status(422).json({ success: false, message: `Could not parse file: ${err.message}` });
  }

  if (rows.length === 0) return res.status(422).json({ success: false, message: 'The file contains no data rows.' });

  console.info('[StudentImport] parsed upload', {
    dryRun,
    rows: rows.length,
    schoolId: String(schoolId),
    branchId: String(branchId),
    academicYearId: String(academicYearId),
  });

  const results = { created: [], skipped: [], errors: [] };
  const credentialsList = [];

  const existingClasses = await Class.find({ school: schoolId, branch: branchId, isDeleted: { $ne: true } }).lean();
  const classMap = {};
  existingClasses.forEach((c) => {
    classMap[`${c.name.toLowerCase()}|${(c.section || 'a').toLowerCase()}`] = c;
  });

  // Track phones/emails seen in this upload (for intra-batch duplicate detection)
  const seenPhones = new Set();
  const seenEmails = new Set();

  for (const row of rows) {
    const rowNum = row.__rowNumber;
    const rowErrors = [];

    const name = row.full_name || row.name || '';
    if (!name || name.split(/\s+/).length < 2) rowErrors.push('Full name is required (at least 2 words).');

    const phone = row.phone_number || row.phone || '';
    const email = (row.email || '').toLowerCase() || undefined;
    const gender = row.gender || '';
    const className = (row.class_name || row.class || '').toLowerCase();
    const section = (row.section || 'A').toUpperCase();
    const parentName = row.parent_name || row.guardian_name || '';
    const placeOfBirth = row.place_of_birth || row.birth_place || '';
    const address = row.address || '';
    const studentMode = row.mode || row.student_mode || 'Full-time';
    const monthlyFees = parseFloat(row.monthly_fees || row.fees || '0') || 0;

    if (!className) rowErrors.push('Class name is required.');
    if (phone && !/^[0-9+]{7,15}$/.test(phone)) rowErrors.push('Invalid phone number format.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowErrors.push('Invalid email format.');

    if (rowErrors.length > 0) {
      results.errors.push({ row: rowNum, data: { name, phone, email }, errors: rowErrors });
      continue;
    }

    // Intra-batch duplicate detection
    if (phone && seenPhones.has(phone)) {
      results.errors.push({ row: rowNum, data: { name, phone, email }, errors: ['Duplicate phone number within the uploaded file.'] });
      continue;
    }
    if (email && seenEmails.has(email)) {
      results.errors.push({ row: rowNum, data: { name, phone, email }, errors: ['Duplicate email within the uploaded file.'] });
      continue;
    }

    // DB-level duplicate detection (scoped to tenant + branch)
    const duplicateTerms = [];
    if (phone) duplicateTerms.push({ phone });
    if (email) duplicateTerms.push({ email });
    const duplicateQuery = { 
      school: schoolId, 
      branch: branchId,
      role: 'student', 
      isDeleted: { $ne: true }
    };
    if (duplicateTerms.length > 0) {
      duplicateQuery.$or = duplicateTerms;
    }
    const duplicate = duplicateTerms.length
      ? await User.findOne(duplicateQuery).lean()
      : null;
    if (duplicate) {
      results.skipped.push({ row: rowNum, data: { name, phone, email }, reason: `Duplicate record (same phone/email already exists in this school and branch).` });
      continue;
    }

    // Mark phone/email as seen
    if (phone) seenPhones.add(phone);
    if (email) seenEmails.add(email);

    // Class resolution (in dry-run we only look up, never create)
    const classKey = `${className}|${section.toLowerCase()}`;
    let classDoc = classMap[classKey];
    if (!classDoc) {
      if (dryRun) {
        // In dry-run, flag as auto-create intent (not an error)
        results.created.push({ row: rowNum, data: { name, phone, email }, name, class: `${className} ${section} (will be created)`, willAutoCreate: true });
        continue;
      }
      try {
        classDoc = await Class.create({
          name: className.charAt(0).toUpperCase() + className.slice(1),
          section,
          maxStudents: 40,
          school: schoolId,
          branch: branchId,
          createdBy: req.user._id,
        });
        classMap[classKey] = classDoc;
      } catch (err) {
        classDoc = await Class.findOne({ school: schoolId, branch: branchId, name: { $regex: new RegExp(`^${className}$`, 'i') }, section: { $regex: new RegExp(`^${section}$`, 'i') }, isDeleted: { $ne: true } }).lean();
        if (!classDoc) {
          results.errors.push({ row: rowNum, data: { name, phone }, errors: [`Could not resolve or create class "${className} ${section}": ${err.message}`] });
          continue;
        }
        classMap[classKey] = classDoc;
      }
    }

    if (dryRun) {
      // Dry-run: record as "will create" without persisting
      results.created.push({ row: rowNum, data: { name, phone, email }, name, class: classDoc ? `${classDoc.name} ${classDoc.section}` : `${className} ${section}` });
      continue;
    }

    // Credential generation
    const customId = await generateStudentId(schoolId);
    const isAuto = credentialMode === 'auto';
    const rawPassword = isAuto ? generateRawPassword(name) : null;

    try {
      const student = await User.create({
        name: name.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
        phone: phone || undefined,
        email: email || undefined,
        gender: ['Male', 'Female', 'Other'].includes(gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase())
          ? gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase() : undefined,
        placeOfBirth: placeOfBirth || undefined,
        address: address || undefined,
        parentName: parentName || undefined,
        monthlyFees,
        studentMode: ['Full-time', 'Part-time'].includes(studentMode) ? studentMode : 'Full-time',
        password: rawPassword || undefined,
        credentialsGenerated: isAuto,
        role: 'student',
        school: schoolId,
        branch: branchId,
        academicYear: academicYearId,
        class: classDoc._id,
        customId,
        status: 'active',
      });

      results.created.push({
        row: rowNum,
        _id: student._id,
        name: student.name,
        customId: student.customId,
        class: student.class,
        branch: student.branch,
        academicYear: student.academicYear,
      });
      if (isAuto) {
        credentialsList.push({ name: student.name, customId: student.customId, class: `${classDoc.name} ${classDoc.section}`, username: student.customId, password: rawPassword });
      }
    } catch (err) {
      results.errors.push({ row: rowNum, data: { name, phone, email }, errors: [`Database error: ${err.message}`] });
    }
  }

  const insertedIds = results.created.map((student) => student._id).filter(Boolean);
  const verifiedInsertedCount = !dryRun && insertedIds.length
    ? await User.countDocuments({
        _id: { $in: insertedIds },
        school: schoolId,
        branch: branchId,
        academicYear: academicYearId,
        role: 'student',
        isDeleted: { $ne: true },
      })
    : 0;

  if (!dryRun && verifiedInsertedCount !== results.created.length) {
    console.error('[StudentImport] verification mismatch', {
      requestedCreated: results.created.length,
      verifiedInsertedCount,
      insertedIds: insertedIds.map(String),
    });
    return res.status(500).json({
      success: false,
      message: 'Import verification failed. Created count does not match database records.',
      userMessage: 'Import verification failed. Please try again or contact support.',
      summary: { total: rows.length, created: verifiedInsertedCount, skipped: results.skipped.length, errors: results.errors.length },
      created: results.created,
      skipped: results.skipped,
      errors: results.errors,
    });
  }

  console.info('[StudentImport] completed', {
    dryRun,
    received: rows.length,
    inserted: dryRun ? 0 : verifiedInsertedCount,
    validPreview: dryRun ? results.created.length : undefined,
    skipped: results.skipped.length,
    failed: results.errors.length,
    transactionStatus: 'not_used_verified',
  });

  if (results.created.length > 0 && !dryRun) {
    logAction(req, {
      action: 'STUDENTS_BULK_IMPORT',
      module: 'STUDENTS',
      details: { count: verifiedInsertedCount, summary: { total: rows.length, created: verifiedInsertedCount, skipped: results.skipped.length, errors: results.errors.length } }
    });
  }

  return res.status(200).json({
    success: dryRun || verifiedInsertedCount === results.created.length,
    dryRun,
    credentialMode,
    summary: { total: rows.length, created: dryRun ? results.created.length : verifiedInsertedCount, skipped: results.skipped.length, errors: results.errors.length },
    willCreate: dryRun ? results.created : undefined,
    created: !dryRun ? results.created : undefined,
    skipped: results.skipped,
    errors: results.errors,
    credentials: credentialsList,
  });
};

// ─── POST /api/admin/students/generate-credentials ───────────────────────────
// Bulk-generate credentials for ALL students in this school with credentialsGenerated=false

export const generateBulkCredentials = async (req, res) => {
  const schoolId = req.user.school;
  if (!schoolId) return res.status(403).json({ success: false, message: 'School context not found.' });

  const students = await User.find({ school: schoolId, role: 'student', credentialsGenerated: false }).lean();
  if (students.length === 0) return res.status(200).json({ success: true, message: 'No students without credentials found.', credentials: [] });

  const credentialsList = [];
  const errors = [];

  for (const s of students) {
    const rawPassword = generateRawPassword(s.name);
    try {
      const salt = await bcrypt.genSalt(12);
      const hashed = await bcrypt.hash(rawPassword, salt);
      await User.findByIdAndUpdate(s._id, { password: hashed, credentialsGenerated: true });
      credentialsList.push({ name: s.name, customId: s.customId, username: s.customId, password: rawPassword });
    } catch (err) {
      errors.push({ studentId: s.customId, error: err.message });
    }
  }

  return res.status(200).json({
    success: true,
    summary: { total: students.length, generated: credentialsList.length, failed: errors.length },
    credentials: credentialsList,
    errors,
  });
};

// ─── POST /api/admin/students/:id/generate-login ─────────────────────────────

export const generateStudentLogin = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school;

  const student = await User.findOne({ _id: id, school: schoolId, role: 'student' });
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

  if (student.credentialsGenerated) {
    return res.status(400).json({ success: false, message: 'This student already has credentials. Use reset-password instead.' });
  }

  const rawPassword = generateRawPassword(student.name);
  student.password = rawPassword; // pre-save hook will hash
  student.credentialsGenerated = true;
  await student.save();

  return res.status(200).json({
    success: true,
    credentials: { name: student.name, customId: student.customId, username: student.customId, password: rawPassword },
  });
};

// ─── POST /api/admin/students/credentials/download ───────────────────────────
// Accepts { credentials: [...] } in body, streams an XLSX

export const downloadCredentials = async (req, res) => {
  const { credentials = [] } = req.body;
  if (!Array.isArray(credentials) || credentials.length === 0) {
    return res.status(400).json({ success: false, message: 'No credentials provided.' });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Credentials');

  sheet.columns = [
    { header: 'Student Name', key: 'name', width: 28 },
    { header: 'Student ID', key: 'customId', width: 15 },
    { header: 'Class', key: 'class', width: 18 },
    { header: 'Username', key: 'username', width: 15 },
    { header: 'Password', key: 'password', width: 20 },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.getRow(1).height = 22;

  credentials.forEach((c) => sheet.addRow({ name: c.name, customId: c.customId, class: c.class || '', username: c.username, password: c.password }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="student_credentials.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
};

// ─── POST /api/admin/students/errors/download ────────────────────────────────

export const downloadStudentErrorReport = async (req, res) => {
  const { errors = [] } = req.body;
  if (!Array.isArray(errors) || errors.length === 0) {
    return res.status(400).json({ success: false, message: 'No errors provided.' });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Error Report');
  sheet.columns = [
    { header: 'Row #', key: 'row', width: 10 },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Error Details', key: 'errors', width: 55 },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.getRow(1).height = 22;

  errors.forEach((e) => {
    const errMsg = Array.isArray(e.errors) ? e.errors.join(' | ') : (e.reason || '');
    sheet.addRow({ row: e.row, name: e.data?.name || '', phone: e.data?.phone || '', email: e.data?.email || '', errors: errMsg });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="import_errors.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
};

// ─── POST /api/admin/exams/import ────────────────────────────────────────────

export const importExamResults = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

  const schoolId = req.user.school;
  if (!schoolId) return res.status(403).json({ success: false, message: 'School context not found.' });

  // Resolve branch ID
  let branchId = getObjectId(req.branchId || req.user.branch);
  
  if (!branchId) {
    // First try to find Main Branch by name or code
    let branch = await Branch.findOne({ 
      tenant: schoolId, 
      status: 'active', 
      deletedAt: { $exists: false },
      $or: [{ name: 'Main Branch' }, { code: 'MAIN' }]
    }).sort({ createdAt: 1 });

    // If no Main Branch found, get first active branch
    if (!branch) {
      branch = await Branch.findOne({ tenant: schoolId, status: 'active', deletedAt: { $exists: false } }).sort({ createdAt: 1 });
    }

    // If still no branch found, automatically create Main Branch
    if (!branch) {
      branch = await Branch.create({
        tenant: schoolId,
        name: 'Main Branch',
        code: 'MAIN',
        status: 'active',
        createdBy: req.user._id
      });
    }
    branchId = branch._id;
  }

  // Resolve academic year
  let academicYearName = req.academicYearName;
  if (!academicYearName) {
    const academicYear = await getCurrentAcademicYear(schoolId, branchId);
    if (academicYear) {
      academicYearName = academicYear.name;
    }
  }

  const { examId } = req.body;
  if (!examId) return res.status(400).json({ success: false, message: '`examId` is required in the request body.' });

  const exam = await Exam.findOne({ _id: examId, school: schoolId }).lean();
  if (!exam) return res.status(404).json({ success: false, message: 'Exam not found for this school.' });

  const dryRun = req.body.dryRun === 'true' || req.body.dryRun === true;

  let rows;
  try {
    rows = await parseWorkbook(req.file.buffer, req.file.mimetype);
  } catch (err) {
    return res.status(422).json({ success: false, message: `Could not parse file: ${err.message}` });
  }
  if (rows.length === 0) return res.status(422).json({ success: false, message: 'The file contains no data rows.' });

  const subjects = await Subject.find({ school: schoolId }).lean();
  const subjectMap = {};
  subjects.forEach((s) => { subjectMap[s.name.toLowerCase()] = s; });

  const results = { inserted: [], skipped: [], errors: [] };

  for (const row of rows) {
    const rowNum = row.__rowNumber;
    const rowErrors = [];
    const studentId = row.student_id || row.customid || row.id || '';
    const subjectName = (row.subject || row.subject_name || '').toLowerCase();
    const score = parseFloat(row.score || row.marks || row.grade || '');
    const term = row.term || row.semester || exam.term || '';

    if (!studentId) rowErrors.push('Student ID is required.');
    if (!subjectName) rowErrors.push('Subject name is required.');
    if (isNaN(score) || score < 0 || score > 100) rowErrors.push('Score must be a number between 0 and 100.');

    if (rowErrors.length > 0) {
      results.errors.push({ row: rowNum, data: { studentId, subjectName, score }, errors: rowErrors });
      continue;
    }

    const student = await User.findOne({ customId: studentId, school: schoolId, role: 'student' }).lean();
    if (!student) {
      results.errors.push({ row: rowNum, data: { studentId, subjectName, score }, errors: [`Student ID "${studentId}" not found in this school.`] });
      continue;
    }

    const subjectDoc = subjectMap[subjectName];
    if (!subjectDoc) {
      results.errors.push({ row: rowNum, data: { studentId, subjectName, score }, errors: [`Subject "${subjectName}" not found. Please create it first.`] });
      continue;
    }

    const existing = await Mark.findOne({ student: student._id, subject: subjectDoc._id, exam: examId, school: schoolId }).lean();
    if (existing) {
      results.skipped.push({ row: rowNum, data: { studentId, subjectName, score }, reason: 'Mark already exists for this student/subject/exam combination.' });
      continue;
    }

    if (dryRun) {
      results.inserted.push({ row: rowNum, studentId, subjectName, score });
      continue;
    }

    try {
      await Mark.create({
        student: student._id,
        subject: subjectDoc._id,
        class: student.class, // Get class from student
        exam: examId,
        school: schoolId,
        branch: branchId,
        academicYear: academicYearName,
        score,
        term
      });
      results.inserted.push({ row: rowNum, studentId, subjectName, score });
    } catch (err) {
      results.errors.push({ row: rowNum, data: { studentId, subjectName, score }, errors: [`Database error: ${err.message}`] });
    }
  }

  return res.status(200).json({
    success: true,
    dryRun,
    summary: { total: rows.length, inserted: results.inserted.length, skipped: results.skipped.length, errors: results.errors.length },
    willCreate: dryRun ? results.inserted : undefined,
    inserted: !dryRun ? results.inserted : undefined,
    skipped: results.skipped,
    errors: results.errors,
  });
};

// ─── POST /api/admin/exams/errors/download ───────────────────────────────────

export const downloadExamErrorReport = async (req, res) => {
  const { errors = [] } = req.body;
  if (!Array.isArray(errors) || errors.length === 0) {
    return res.status(400).json({ success: false, message: 'No errors provided.' });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Exam Error Report');
  sheet.columns = [
    { header: 'Row #', key: 'row', width: 10 },
    { header: 'Student ID', key: 'studentId', width: 15 },
    { header: 'Subject', key: 'subjectName', width: 20 },
    { header: 'Score', key: 'score', width: 10 },
    { header: 'Error Details', key: 'errors', width: 55 },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.getRow(1).height = 22;

  errors.forEach((e) => {
    const errMsg = Array.isArray(e.errors) ? e.errors.join(' | ') : (e.reason || '');
    sheet.addRow({ row: e.row, studentId: e.data?.studentId || '', subjectName: e.data?.subjectName || '', score: e.data?.score ?? '', errors: errMsg });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="exam_import_errors.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
};

// ─── GET /api/admin/students/import/template ─────────────────────────────────

export const downloadStudentTemplate = async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Students');

  sheet.columns = [
    { header: 'Full Name', key: 'full_name', width: 25 },
    { header: 'Gender', key: 'gender', width: 10 },
    { header: 'Phone Number', key: 'phone_number', width: 18 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Class Name', key: 'class_name', width: 15 },
    { header: 'Section', key: 'section', width: 10 },
    { header: 'Parent Name', key: 'parent_name', width: 25 },
    { header: 'Place of Birth', key: 'place_of_birth', width: 20 },
    { header: 'Address', key: 'address', width: 30 },
    { header: 'Monthly Fees', key: 'monthly_fees', width: 15 },
    { header: 'Mode', key: 'mode', width: 12 },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.getRow(1).height = 22;

  sheet.addRow({ full_name: 'Ahmed Ali Hassan', gender: 'Male', phone_number: '0612345678', email: 'ahmed@example.com', class_name: 'Grade 10', section: 'A', parent_name: 'Ali Hassan', place_of_birth: 'Mogadishu', address: 'KM4, Hodan District', monthly_fees: '50', mode: 'Full-time' });
  sheet.addRow({ full_name: 'Fatima Omar Said', gender: 'Female', phone_number: '0698765432', email: '', class_name: 'Grade 9', section: 'B', parent_name: 'Omar Said', place_of_birth: 'Hargeisa', address: 'District 5', monthly_fees: '50', mode: 'Full-time' });

  // Instructions sheet
  const infoSheet = workbook.addWorksheet('Instructions');
  infoSheet.getColumn(1).width = 80;
  const notes = [
    ['STUDENT IMPORT TEMPLATE — INSTRUCTIONS'],
    [''],
    ['Required columns:  Full Name, Class Name'],
    ['Optional columns:  Gender, Phone Number, Email, Section, Parent Name, Place of Birth, Address, Monthly Fees, Mode'],
    [''],
    ['Gender must be one of: Male, Female, Other'],
    ['Mode must be one of: Full-time, Part-time (defaults to Full-time)'],
    ['Phone numbers must be 7-15 digits (+ allowed)'],
    ['Do not modify the column headers in the Students sheet'],
  ];
  notes.forEach(([text], i) => {
    const cell = infoSheet.getCell(`A${i + 1}`);
    cell.value = text;
    if (i === 0) cell.font = { bold: true, size: 13 };
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="student_import_template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
};

// ─── GET /api/admin/exams/import/template ────────────────────────────────────

export const downloadExamTemplate = async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Exam Results');

  sheet.columns = [
    { header: 'Student ID', key: 'student_id', width: 15 },
    { header: 'Subject', key: 'subject', width: 20 },
    { header: 'Score', key: 'score', width: 10 },
    { header: 'Term', key: 'term', width: 15 },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.getRow(1).height = 22;

  sheet.addRow({ student_id: 'STD0001', subject: 'Mathematics', score: '88', term: 'Term 1' });
  sheet.addRow({ student_id: 'STD0002', subject: 'English', score: '74', term: 'Term 1' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="exam_import_template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
};

// ─── POST /api/admin/teachers/import ─────────────────────────────────────────

export const importTeachers = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

  const schoolId = req.user.school;
  if (!schoolId) return res.status(403).json({ success: false, message: 'School context not found.' });

  // Resolve branch ID
  let branchId = getObjectId(req.branchId || req.user.branch);
  
  if (!branchId) {
    // First try to find Main Branch by name or code
    let branch = await Branch.findOne({ 
      tenant: schoolId, 
      status: 'active', 
      deletedAt: { $exists: false },
      $or: [{ name: 'Main Branch' }, { code: 'MAIN' }]
    }).sort({ createdAt: 1 });

    // If no Main Branch found, get first active branch
    if (!branch) {
      branch = await Branch.findOne({ tenant: schoolId, status: 'active', deletedAt: { $exists: false } }).sort({ createdAt: 1 });
    }

    // If still no branch found, automatically create Main Branch
    if (!branch) {
      branch = await Branch.create({
        tenant: schoolId,
        name: 'Main Branch',
        code: 'MAIN',
        status: 'active',
        createdBy: req.user._id
      });
    }
    branchId = branch._id;
  }

  // Resolve academic year ID
  let academicYearId = req.academicYearId;
  if (!academicYearId) {
    const academicYear = await getCurrentAcademicYear(schoolId, branchId);
    if (!academicYear) {
      return res.status(400).json({
        success: false,
        message: 'No active academic year found. Please configure an academic year first.',
        userMessage: 'No active academic year found. Please configure an academic year first.',
      });
    }
    academicYearId = academicYear._id;
  }

  const dryRun = req.body.dryRun === 'true' || req.body.dryRun === true;

  let rows;
  try {
    rows = await parseWorkbook(req.file.buffer, req.file.mimetype);
  } catch (err) {
    return res.status(422).json({ success: false, message: `Could not parse file: ${err.message}` });
  }

  if (rows.length === 0)
    return res.status(422).json({ success: false, message: 'The file contains no data rows.' });

  // Build subject name → _id map for this school
  const subjectDocs = await Subject.find({ school: schoolId }).lean();
  const subjectMap = {};
  subjectDocs.forEach((s) => { subjectMap[s.name.toLowerCase()] = s._id; });

  const results = { created: [], skipped: [], errors: [] };

  // Intra-batch duplicate detection
  const seenPhones = new Set();
  const seenEmails = new Set();

  for (const row of rows) {
    const rowNum = row.__rowNumber;
    const rowErrors = [];

    const name = row.full_name || row.name || '';
    if (!name || name.trim().split(/\s+/).length < 2)
      rowErrors.push('Full name is required (at least 2 words).');

    const phone   = (row.phone_number || row.phone || '').trim();
    const email   = (row.email || '').toLowerCase().trim() || undefined;
    const age     = parseInt(row.age || '', 10);
    const startTime = row.working_start_time || row.start_time || '';
    const endTime   = row.working_end_time   || row.end_time   || '';

    // Parse subjects: comma-separated names
    const rawSubjects = (row.subjects || row.subject || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const resolvedSubjectIds = [];
    const unresolvedSubjects = [];
    rawSubjects.forEach((sn) => {
      if (subjectMap[sn]) resolvedSubjectIds.push(subjectMap[sn]);
      else unresolvedSubjects.push(sn);
    });

    if (phone && !/^[0-9+]{7,15}$/.test(phone)) rowErrors.push('Invalid phone number format.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowErrors.push('Invalid email format.');
    if (row.age && (isNaN(age) || age < 18 || age > 70)) rowErrors.push('Age must be between 18 and 70.');
    if (startTime && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) rowErrors.push('Invalid working start time format (HH:MM).');
    if (endTime   && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(endTime)) rowErrors.push('Invalid working end time format (HH:MM).');
    if (unresolvedSubjects.length > 0) rowErrors.push(`Subjects not found: ${unresolvedSubjects.join(', ')}. Create them first.`);

    if (rowErrors.length > 0) {
      results.errors.push({ row: rowNum, data: { name, phone, email }, errors: rowErrors });
      continue;
    }

    // Intra-batch duplicate check
    if (phone && seenPhones.has(phone)) {
      results.errors.push({ row: rowNum, data: { name, phone, email }, errors: ['Duplicate phone number in this upload.'] });
      continue;
    }
    if (email && seenEmails.has(email)) {
      results.errors.push({ row: rowNum, data: { name, phone, email }, errors: ['Duplicate email in this upload.'] });
      continue;
    }

    // DB-level duplicate check (scoped to tenant + branch)
    const dupQuery = { school: schoolId, branch: branchId, role: 'teacher', isDeleted: { $ne: true } };
    if (phone) dupQuery.phone = phone;
    else if (email) dupQuery.email = email;
    const duplicate = (phone || email) ? await User.findOne(dupQuery).lean() : null;
    if (duplicate) {
      results.skipped.push({ row: rowNum, data: { name, phone, email }, reason: 'Teacher already exists in this school and branch (same phone/email).' });
      continue;
    }

    if (phone) seenPhones.add(phone);
    if (email) seenEmails.add(email);

    if (dryRun) {
      results.created.push({ row: rowNum, data: { name, phone, email }, name, subjects: rawSubjects.join(', ') || '—' });
      continue;
    }

    // Generate Teacher ID and password
    const customId    = await generateTeacherId(schoolId);
    const rawPassword = generateRawPassword(name);

    try {
      const teacher = await User.create({
        name: name.trim().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
        phone: phone || undefined,
        email: email || undefined,
        teacherAge: !isNaN(age) ? age : undefined,
        workingStartTime: startTime || undefined,
        workingEndTime:   endTime   || undefined,
        subjects: resolvedSubjectIds,
        password: rawPassword,
        role: 'teacher',
        school: schoolId,
        branch: branchId,
        academicYear: academicYearId,
        customId,
        status: 'active',
      });
      results.created.push({ row: rowNum, name: teacher.name, customId: teacher.customId });
    } catch (err) {
      results.errors.push({ row: rowNum, data: { name, phone, email }, errors: [`Database error: ${err.message}`] });
    }
  }

  if (results.created.length > 0 && !dryRun) {
    logAction(req, {
      action: 'TEACHERS_BULK_IMPORT',
      module: 'TEACHERS',
      details: { count: results.created.length, summary: results.summary }
    });
  }

  return res.status(200).json({
    success: true,
    dryRun,
    summary: {
      total: rows.length,
      created: results.created.length,
      skipped: results.skipped.length,
      errors:  results.errors.length,
    },
    willCreate: dryRun  ? results.created : undefined,
    created:    !dryRun ? results.created : undefined,
    skipped:    results.skipped,
    errors:     results.errors,
  });
};

// ─── POST /api/admin/teachers/errors/download ─────────────────────────────────

export const downloadTeacherErrorReport = async (req, res) => {
  const { errors = [] } = req.body;
  if (!Array.isArray(errors) || errors.length === 0)
    return res.status(400).json({ success: false, message: 'No errors provided.' });

  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet('Teacher Import Errors');
  sheet.columns  = [
    { header: 'Row #', key: 'row', width: 10 },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Error Details', key: 'errors', width: 55 },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.getRow(1).height = 22;

  errors.forEach((e) => {
    const errMsg = Array.isArray(e.errors) ? e.errors.join(' | ') : (e.reason || '');
    sheet.addRow({ row: e.row, name: e.data?.name || '', phone: e.data?.phone || '', email: e.data?.email || '', errors: errMsg });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="teacher_import_errors.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
};

// ─── GET /api/admin/teachers/import/template ──────────────────────────────────

export const downloadTeacherTemplate = async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet('Teachers');

  sheet.columns = [
    { header: 'Full Name', key: 'full_name', width: 25 },
    { header: 'Phone Number', key: 'phone_number', width: 18 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Age', key: 'age', width: 8 },
    { header: 'Subjects', key: 'subjects', width: 35 },
    { header: 'Working Start Time', key: 'working_start_time', width: 20 },
    { header: 'Working End Time', key: 'working_end_time', width: 18 },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.getRow(1).height = 22;

  sheet.addRow({ full_name: 'Ahmed Ali Hassan', phone_number: '0612345678', email: 'ahmed@school.com', age: '35', subjects: 'Mathematics, Physics', working_start_time: '07:30', working_end_time: '14:00' });
  sheet.addRow({ full_name: 'Fatima Omar Said', phone_number: '0698765432', email: '', age: '28', subjects: 'English', working_start_time: '08:00', working_end_time: '15:00' });

  // Instructions sheet
  const infoSheet = workbook.addWorksheet('Instructions');
  infoSheet.getColumn(1).width = 85;
  const notes = [
    ['TEACHER IMPORT TEMPLATE — INSTRUCTIONS'],
    [''],
    ['Required columns:  Full Name'],
    ['Optional columns:  Phone Number, Email, Age, Subjects, Working Start Time, Working End Time'],
    [''],
    ['Subjects: comma-separated list of subject NAMES that already exist in your school (e.g., "Mathematics, Physics")'],
    ['Working times must be in HH:MM format (e.g., 07:30)'],
    ['Age must be between 18 and 70'],
    ['Phone numbers must be 7-15 digits (+ allowed)'],
    ['Each teacher will receive an auto-generated Teacher ID and login password'],
    ['Do not modify the column headers in the Teachers sheet'],
  ];
  notes.forEach(([text], i) => {
    const cell = infoSheet.getCell(`A${i + 1}`);
    cell.value = text;
    if (i === 0) cell.font = { bold: true, size: 13 };
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="teacher_import_template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
};
