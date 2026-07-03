import User from '../models/User.js';
import AcademicYear from '../models/AcademicYear.js';
import Class from '../models/Class.js';
import PromotionHistory from '../models/PromotionHistory.js';
import { logAction } from '../utils/auditLogger.js';

// Helper function to get next grade name
const getNextGrade = (gradeName) => {
  // Match patterns like "Grade X", "Form X", "Class X", etc.
  const match = gradeName.match(/(\D+)(\d+)/);
  if (match) {
    const prefix = match[1].trim();
    const currentNumber = parseInt(match[2]);
    if (currentNumber < 12) {
      return `${prefix}${currentNumber + 1}`;
    }
  }
  // Fallback: try to extract any number from the name
  const numberMatch = gradeName.match(/(\d+)/);
  if (numberMatch) {
    const currentNumber = parseInt(numberMatch[1]);
    if (currentNumber < 12) {
      return gradeName.replace(numberMatch[1], currentNumber + 1);
    }
  }
  return null; // Don't create Grade 13 or higher
};

/**
 * @desc    Get all academic years for a tenant/branch
 * @route   GET /api/academic/years
 * @access  Private
 */
export const getAcademicYears = async (req, res) => {
  try {
    const query = { tenant: req.schoolId };
    
    // If a branch is selected, filter by it, otherwise show all for the school
    if (req.branchId) {
      query.$or = [{ branch: req.branchId }, { branch: null }]; // Global or branch-specific
    }

    const academicYears = await AcademicYear.find(query).sort({ startDate: -1 });
    
    res.json({
      success: true,
      data: academicYears
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Create a new academic year and auto-generate next class structure
 * @route   POST /api/academic/years
 * @access  Private (School Admin)
 */
export const createAcademicYear = async (req, res) => {
  try {
    const { name, startDate, endDate, status } = req.body;

    // Check if name already exists for this tenant
    const existing = await AcademicYear.findOne({ name, tenant: req.schoolId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Academic year name already exists' });
    }

    // If this is set to active, deactivate others
    if (status === 'active' || req.body.isCurrent) {
      await AcademicYear.updateMany(
        { tenant: req.schoolId, branch: req.branchId || null },
        { status: 'previous', isCurrent: false }
      );
    }

    const academicYear = await AcademicYear.create({
      name,
      startDate,
      endDate,
      status: status === 'active' ? 'active' : (status || 'inactive'),
      isCurrent: status === 'active' || req.body.isCurrent === true,
      tenant: req.schoolId,
      branch: req.branchId || null, // Can be global or branch-specific
      createdBy: req.user._id
    });

    // Auto-generate next class structure from previous academic year
    const previousYear = await AcademicYear.findOne({
      tenant: req.schoolId,
      branch: req.branchId || null,
      _id: { $ne: academicYear._id }
    }).sort({ startDate: -1 });

    let createdClasses = [];
    if (previousYear) {
      // Get all classes from previous year
      const previousClasses = await Class.find({
        school: req.schoolId,
        branch: req.branchId || null,
        academicYear: previousYear._id,
        isDeleted: { $ne: true }
      });

      // Generate next classes
      for (const cls of previousClasses) {
        const nextGradeName = getNextGrade(cls.name);
        if (nextGradeName) {
          try {
            const newClass = await Class.create({
              name: nextGradeName,
              section: cls.section,
              maxStudents: cls.maxStudents,
              school: req.schoolId,
              branch: cls.branch,
              academicYear: academicYear._id,
              createdBy: req.user._id
            });
            createdClasses.push(newClass);
          } catch (err) {
            // Skip duplicate (already exists)
            console.log('Class already exists:', nextGradeName, cls.section);
          }
        }
      }
    }

    res.status(201).json({
      success: true,
      data: academicYear,
      createdClasses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get promotion preview for a new academic year
 * @route   GET /api/academic/promotion-preview
 * @access  Private (School Admin)
 */
export const getPromotionPreview = async (req, res) => {
  try {
    const { toAcademicYearId } = req.query;
    
    // Get current/previous academic year
    const fromAcademicYear = await AcademicYear.findOne({
      tenant: req.schoolId,
      branch: req.branchId || null,
      status: { $in: ['active', 'previous'] }
    }).sort({ startDate: -1 });
    
    let toAcademicYear;
    if (toAcademicYearId) {
      toAcademicYear = await AcademicYear.findById(toAcademicYearId);
    } else {
      toAcademicYear = await AcademicYear.findOne({
        tenant: req.schoolId,
        branch: req.branchId || null,
        status: 'active'
      });
    }
    
    if (!fromAcademicYear || !toAcademicYear) {
      return res.status(400).json({
        success: false,
        message: 'Need both previous and next academic years'
      });
    }
    
    // Get classes from both years
    const fromClasses = await Class.find({
      school: req.schoolId,
      branch: req.branchId || null,
      academicYear: fromAcademicYear._id,
      isDeleted: { $ne: true }
    });
    
    const toClasses = await Class.find({
      school: req.schoolId,
      branch: req.branchId || null,
      academicYear: toAcademicYear._id,
      isDeleted: { $ne: true }
    });
    
    // Map classes by (name, section) for quick lookup
    const toClassMap = new Map();
    toClasses.forEach(cls => {
      toClassMap.set(`${cls.name}__${cls.section}`, cls);
    });
    
    // Get students in from classes
    const students = await User.find({
      school: req.schoolId,
      branch: req.branchId || null,
      role: 'student',
      class: { $in: fromClasses.map(c => c._id) },
      status: 'active',
      isDeleted: { $ne: true }
    }).populate('class', 'name section');
    
    // Generate promotion preview
    const promotionPreview = [];
    for (const student of students) {
      const fromClass = student.class;
      const nextGradeName = getNextGrade(fromClass.name);
      
      let toClass = null;
      if (nextGradeName) {
        toClass = toClassMap.get(`${nextGradeName}__${fromClass.section}`);
      }
      
      promotionPreview.push({
        student: {
          _id: student._id,
          name: student.name,
          customId: student.customId
        },
        fromClass,
        toClass,
        isGraduating: !nextGradeName,
        action: 'promote' // default action
      });
    }
    
    res.json({
      success: true,
      data: {
        fromAcademicYear,
        toAcademicYear,
        promotionPreview
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Hold students back (don't promote them)
 * @route   POST /api/academic/hold-students
 * @access  Private (School Admin)
 */
export const holdStudentsBack = async (req, res) => {
  try {
    const { studentIds, academicYearId, notes } = req.body;
    
    const result = await User.updateMany(
      { 
        _id: { $in: studentIds }, 
        school: req.schoolId, 
        branch: req.branchId, 
        role: 'student' 
      },
      {
        $set: {
          updatedBy: req.user._id,
          status: 'active'
        }
      }
    );
    
    // Log the action
    await logAction(req, {
      action: 'STUDENTS_HELD_BACK',
      module: 'ACADEMIC',
      details: { count: result.modifiedCount, studentIds, academicYearId, notes }
    });
    
    res.json({
      success: true,
      message: `Held ${result.modifiedCount} students back`,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Update an academic year
 * @route   PUT /api/academic/years/:id
 * @access  Private (School Admin)
 */
export const updateAcademicYear = async (req, res) => {
  try {
    const { status, isCurrent } = req.body;

    // If this is being set to active/current, deactivate others
    if (status === 'active' || isCurrent === true) {
      const existing = await AcademicYear.findOne({ _id: req.params.id, tenant: req.schoolId });
      await AcademicYear.updateMany(
        {
          tenant: req.schoolId,
          branch: existing?.branch || req.branchId || null,
          _id: { $ne: req.params.id },
        },
        { status: 'previous', isCurrent: false }
      );
      req.body.status = 'active';
      req.body.isCurrent = true;
    }

    if (status === 'archived') {
      req.body.isCurrent = false;
    }

    const academicYear = await AcademicYear.findOneAndUpdate(
      { _id: req.params.id, tenant: req.schoolId },
      { ...req.body, updatedBy: req.user._id },
      { new: true }
    );

    if (!academicYear) {
      return res.status(404).json({ success: false, message: 'Academic year not found' });
    }

    logAction(req, {
      action: 'ACADEMIC_YEAR_UPDATE',
      module: 'ACADEMIC',
      targetId: academicYear._id,
      details: { status: academicYear.status, isCurrent: academicYear.isCurrent },
    });

    res.json({
      success: true,
      data: academicYear
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Activate an academic year (switch current year)
 */
export const activateAcademicYear = async (req, res) => {
  try {
    const year = await AcademicYear.findOne({ _id: req.params.id, tenant: req.schoolId });
    if (!year) {
      return res.status(404).json({ success: false, message: 'Academic year not found' });
    }

    await AcademicYear.updateMany(
      { tenant: req.schoolId, branch: year.branch, _id: { $ne: year._id } },
      { status: 'previous', isCurrent: false }
    );

    year.status = 'active';
    year.isCurrent = true;
    year.updatedBy = req.user._id;
    await year.save();

    logAction(req, {
      action: 'ACADEMIC_YEAR_ACTIVATE',
      module: 'ACADEMIC',
      targetId: year._id,
    });

    res.json({ success: true, data: year });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Archive an academic year (historical, read-only)
 */
export const archiveAcademicYear = async (req, res) => {
  try {
    const year = await AcademicYear.findOneAndUpdate(
      { _id: req.params.id, tenant: req.schoolId },
      { status: 'archived', isCurrent: false, updatedBy: req.user._id },
      { new: true }
    );
    if (!year) {
      return res.status(404).json({ success: false, message: 'Academic year not found' });
    }

    logAction(req, {
      action: 'ACADEMIC_YEAR_ARCHIVE',
      module: 'ACADEMIC',
      targetId: year._id,
    });

    res.json({ success: true, data: year });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Inject current academic year middleware
 * @access  Private
 */
export const injectAcademicYear = async (req, res, next) => {
  try {
    // Check if overridden via header
    const headerAY = req.headers['x-academic-year-id'];
    
    if (headerAY) {
      req.academicYearId = headerAY;
      return next();
    }

    // Otherwise find active one
    const activeAY = await AcademicYear.findOne({ tenant: req.schoolId, status: 'active' });
    if (activeAY) {
      req.academicYearId = activeAY._id;
    }
    
    next();
  } catch (error) {
    next();
  }
};

/**
 * @desc    Promote students from one class to another
 * @route   POST /api/academic/promote
 * @access  Private (School Admin)
 */
const runPromotion = async (req, res, promotionType) => {
  try {
    const {
      studentIds,
      fromClassId,
      toClassId,
      fromYearId,
      toYearId,
      status = 'active',
    } = req.body;

    let ids = studentIds;
    if (!ids?.length && fromClassId) {
      const students = await User.find({
        role: 'student',
        school: req.schoolId,
        branch: req.branchId,
        class: fromClassId,
        deletedAt: { $exists: false },
        isDeleted: { $ne: true },
      }).select('_id');
      ids = students.map((s) => s._id);
    }

    if (!ids?.length || !toClassId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required promotion data (students or source class, target class)',
      });
    }

    const updatePayload = {
      class: toClassId,
      status,
      updatedBy: req.user._id,
    };
    if (toYearId) updatePayload.academicYear = toYearId;

    const result = await User.updateMany(
      {
        _id: { $in: ids },
        school: req.schoolId,
        branch: req.branchId,
        role: 'student',
      },
      { $set: updatePayload }
    );

    await PromotionHistory.create({
      school: req.schoolId,
      branch: req.branchId,
      promotionType,
      fromClass: fromClassId,
      toClass: toClassId,
      fromAcademicYear: fromYearId,
      toAcademicYear: toYearId,
      studentIds: ids,
      studentCount: result.modifiedCount,
      promotedBy: req.user._id,
      metadata: req.body,
    });

    await logAction(req, {
      action: 'STUDENT_PROMOTION',
      module: 'ACADEMIC',
      details: {
        promotionType,
        fromClassId,
        toClassId,
        fromYearId,
        toYearId,
        count: result.modifiedCount,
        studentIds: ids,
      },
    });

    res.json({
      success: true,
      message: `Successfully promoted ${result.modifiedCount} students`,
      data: { modifiedCount: result.modifiedCount, studentIds: ids },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const promoteStudents = (req, res) => runPromotion(req, res, 'individual');

export const promoteClass = (req, res) => runPromotion(req, res, 'class');

export const promoteGrade = async (req, res) => {
  try {
    const { fromClassIds, toClassId, fromYearId, toYearId } = req.body;
    if (!Array.isArray(fromClassIds) || !fromClassIds.length || !toClassId) {
      return res.status(400).json({
        success: false,
        message: 'fromClassIds and toClassId are required for grade promotion',
      });
    }

    req.body.fromClassId = fromClassIds[0];
    const students = await User.find({
      role: 'student',
      school: req.schoolId,
      branch: req.branchId,
      class: { $in: fromClassIds },
      deletedAt: { $exists: false },
    }).select('_id class');

    req.body.studentIds = students.map((s) => s._id);
    req.body.fromClassId = fromClassIds.join(',');
    return runPromotion(req, res, 'grade');
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPromotionHistory = async (req, res) => {
  try {
    const query = { school: req.schoolId };
    if (req.branchId) query.branch = req.branchId;

    const history = await PromotionHistory.find(query)
      .populate('fromClass', 'name section')
      .populate('toClass', 'name section')
      .populate('fromAcademicYear', 'name')
      .populate('toAcademicYear', 'name')
      .populate('promotedBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Graduate students (set status to graduated)
 * @route   POST /api/academic/graduate
 * @access  Private (School Admin)
 */
export const graduateStudents = async (req, res) => {
  try {
    const { studentIds } = req.body;

    const result = await User.updateMany(
      { 
        _id: { $in: studentIds },
        school: req.schoolId,
        branch: req.branchId,
        role: 'student'
      },
      { 
        $set: { 
          status: 'graduated',
          updatedBy: req.user._id
        }
      }
    );

    await logAction(req, {
      action: 'STUDENT_GRADUATION',
      module: 'ACADEMIC',
      details: { count: studentIds.length, studentIds }
    });

    res.json({
      success: true,
      message: `Successfully graduated ${result.modifiedCount} students`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Transfer student to another branch or class
 * @route   POST /api/academic/transfer
 * @access  Private (School Admin)
 */
export const transferStudent = async (req, res) => {
  try {
    const { studentId, toBranchId, toClassId, reason } = req.body;

    if (!studentId || (!toBranchId && !toClassId)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required transfer data'
      });
    }

    const student = await User.findOne({
      _id: studentId,
      school: req.schoolId,
      role: 'student'
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const updateData = {
      updatedBy: req.user._id
    };

    if (toBranchId) updateData.branch = toBranchId;
    if (toClassId) updateData.class = toClassId;

    const oldBranchId = student.branch;
    const oldClassId = student.class;

    await User.findByIdAndUpdate(studentId, { $set: updateData });

    // Log the transfer action with full details for audit
    await logAction(req, {
      action: 'STUDENT_TRANSFER',
      module: 'ACADEMIC',
      details: {
        studentId,
        studentName: student.name,
        oldBranchId,
        toBranchId,
        oldClassId,
        toClassId,
        reason
      }
    });

    res.json({
      success: true,
      message: 'Student transferred successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
