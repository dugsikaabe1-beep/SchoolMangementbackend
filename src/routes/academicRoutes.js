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
  transferStudent
} from '../controllers/academicController.js';
import { 
  protect, 
  authorize,
  checkPermission 
} from '../middlewares/authMiddleware.js';
import { branchIsolation } from '../middlewares/branchMiddleware.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { injectOwnership } from '../middlewares/tenantMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(injectOwnership);
router.use(auditMiddleware('ACADEMIC_MANAGEMENT'));

// Academic Year Management
router.use('/years', checkModuleAccess('academic-years'));
router.route('/years')
  .get(checkPermission('settings.view'), getAcademicYears)
  .post(checkPermission('settings.manage'), createAcademicYear);

router.route('/years/:id')
  .put(checkPermission('settings.manage'), updateAcademicYear);

router.post('/years/:id/activate', checkPermission('settings.manage'), activateAcademicYear);
router.post('/years/:id/archive', checkPermission('settings.manage'), archiveAcademicYear);

// Student Lifecycle Management
router.use('/promote', checkModuleAccess('promotions'));
router.use('/graduate', checkModuleAccess('promotions'));
router.use('/transfer', checkModuleAccess('students'));
router.post('/promote', checkPermission('students.edit'), branchIsolation, promoteStudents);
router.post('/promote/class', checkPermission('students.edit'), branchIsolation, promoteClass);
router.post('/promote/grade', checkPermission('students.edit'), branchIsolation, promoteGrade);
router.post('/graduate', checkPermission('students.edit'), branchIsolation, graduateStudents);
router.post('/transfer', checkPermission('students.edit'), transferStudent); // May involve branch transfer

export default router;
