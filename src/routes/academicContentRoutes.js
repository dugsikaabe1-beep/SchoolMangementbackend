import express from 'express';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { injectBranch, injectOwnership } from '../middlewares/tenantMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { getHomeworks, getHomeworkById, createHomework, updateHomework, deleteHomework, gradeHomework, getLessonPlans, createLessonPlan, updateLessonPlan, deleteLessonPlan, getCurriculums, createCurriculum, updateCurriculum, deleteCurriculum } from '../controllers/academicContentController.js';

const router = express.Router();
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(auditMiddleware('ACADEMIC_CONTENT'));

router.route('/homework').get(asyncHandler(getHomeworks)).post(checkPermission('teachers.manage'), asyncHandler(createHomework));
router.route('/homework/:id').get(asyncHandler(getHomeworkById)).put(checkPermission('teachers.manage'), asyncHandler(updateHomework)).delete(checkPermission('teachers.manage'), asyncHandler(deleteHomework));
router.post('/homework/:id/grade', checkPermission('teachers.manage'), asyncHandler(gradeHomework));

router.route('/lesson-plans').get(asyncHandler(getLessonPlans)).post(checkPermission('teachers.manage'), asyncHandler(createLessonPlan));
router.route('/lesson-plans/:id').put(checkPermission('teachers.manage'), asyncHandler(updateLessonPlan)).delete(checkPermission('teachers.manage'), asyncHandler(deleteLessonPlan));

router.route('/curriculum').get(asyncHandler(getCurriculums)).post(checkPermission('settings.manage'), asyncHandler(createCurriculum));
router.route('/curriculum/:id').put(checkPermission('settings.manage'), asyncHandler(updateCurriculum)).delete(checkPermission('settings.manage'), asyncHandler(deleteCurriculum));

export default router;
