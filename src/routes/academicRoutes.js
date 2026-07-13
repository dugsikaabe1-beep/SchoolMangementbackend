import express from 'express';
import { 
  getAcademicYears, 
  createAcademicYear, 
  updateAcademicYear,
  activateAcademicYear,
  archiveAcademicYear,
  promoteStudents,
  promoteClass,
  promoteGrade,
  graduateStudents,
  transferStudent,
  getPromotionPreview,
  holdStudentsBack,
  getPromotionHistory,
  getAcademicTerms,
  createAcademicTerm,
  updateAcademicTerm,
  deleteAcademicTerm,
  activateAcademicTerm,
  archiveAcademicTerm,
  getStreams,
  createStream,
  updateStream,
  deleteStream
} from '../controllers/academicController.js';
import { 
  protect, 
  authorize,
  checkPermission 
} from '../middlewares/authMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { injectOwnership, injectBranch } from '../middlewares/tenantMiddleware.js';
import { injectAcademicYear } from '../utils/academicUtils.js';
import {
  validate,
  academicTermQuerySchema,
  academicTermParamSchema,
  createAcademicTermSchema,
  updateAcademicTermSchema,
  streamParamSchema,
  createStreamSchema,
  updateStreamSchema,
} from '../middlewares/validationMiddleware.js';

const router = express.Router();

router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(asyncHandler(injectAcademicYear));
router.use(injectOwnership);
router.use(auditMiddleware('ACADEMIC_MANAGEMENT'));

// Academic Year Management
router.use('/years', checkModuleAccess('academic-years'));
router.route('/years')
  .get(checkPermission('settings.view'), asyncHandler(getAcademicYears))
  .post(checkPermission('settings.manage'), asyncHandler(createAcademicYear));

router.route('/years/:id')
  .put(checkPermission('settings.manage'), asyncHandler(updateAcademicYear));

router.post('/years/:id/activate', checkPermission('settings.manage'), asyncHandler(activateAcademicYear));
router.post('/years/:id/archive', checkPermission('settings.manage'), asyncHandler(archiveAcademicYear));

// Academic Term Management
router.use('/terms', checkModuleAccess('academic-years'));
router.route('/terms')
  .get(checkPermission('settings.view'), validate(academicTermQuerySchema), asyncHandler(getAcademicTerms))
  .post(checkPermission('settings.manage'), validate(createAcademicTermSchema), asyncHandler(createAcademicTerm));

router.route('/terms/:id')
  .put(checkPermission('settings.manage'), validate(updateAcademicTermSchema), asyncHandler(updateAcademicTerm))
  .delete(checkPermission('settings.manage'), validate(academicTermParamSchema), asyncHandler(deleteAcademicTerm));

router.post('/terms/:id/activate', checkPermission('settings.manage'), validate(academicTermParamSchema), asyncHandler(activateAcademicTerm));
router.post('/terms/:id/archive', checkPermission('settings.manage'), validate(academicTermParamSchema), asyncHandler(archiveAcademicTerm));

// Stream Management
router.use('/streams', checkModuleAccess('academic-years'));
router.route('/streams')
  .get(checkPermission('settings.view'), asyncHandler(getStreams))
  .post(checkPermission('settings.manage'), validate(createStreamSchema), asyncHandler(createStream));

router.route('/streams/:id')
  .put(checkPermission('settings.manage'), validate(updateStreamSchema), asyncHandler(updateStream))
  .delete(checkPermission('settings.manage'), validate(streamParamSchema), asyncHandler(deleteStream));

// Student Promotion Management
router.use('/promote', checkModuleAccess('promotions'));
router.use('/graduate', checkModuleAccess('promotions'));
router.use('/transfer', checkModuleAccess('students'));
router.get('/promotion-preview', checkPermission('students.view'), asyncHandler(branchIsolation), asyncHandler(getPromotionPreview));
router.post('/promote', checkPermission('students.edit'), asyncHandler(branchIsolation), asyncHandler(promoteStudents));
router.post('/promote/class', checkPermission('students.edit'), asyncHandler(branchIsolation), asyncHandler(promoteClass));
router.post('/promote/grade', checkPermission('students.edit'), asyncHandler(branchIsolation), asyncHandler(promoteGrade));
router.post('/hold-students', checkPermission('students.edit'), asyncHandler(branchIsolation), asyncHandler(holdStudentsBack));
router.post('/graduate', checkPermission('students.edit'), asyncHandler(branchIsolation), asyncHandler(graduateStudents));
router.post('/transfer', checkPermission('students.edit'), asyncHandler(transferStudent)); // May involve branch transfer
router.get('/promotion-history', checkPermission('students.view'), asyncHandler(branchIsolation), asyncHandler(getPromotionHistory));

export default router;
