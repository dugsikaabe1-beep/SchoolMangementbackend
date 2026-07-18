import express from 'express';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { injectBranch, injectOwnership } from '../middlewares/tenantMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { getLoans, createLoan, approveLoan, rejectLoan, getReviews, createReview, updateReview, getContracts, createContract, updateContract, getJobPostings, createJobPosting, updateJobPosting, deleteJobPosting } from '../controllers/hrController.js';

const router = express.Router();
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(checkSubscription);
router.use(checkModuleAccess('payroll'));
router.use(auditMiddleware('HR'));

router.route('/loans').get(checkPermission('finance.view'), asyncHandler(getLoans)).post(checkPermission('finance.manage'), asyncHandler(createLoan));
router.post('/loans/:id/approve', checkPermission('finance.manage'), asyncHandler(approveLoan));
router.post('/loans/:id/reject', checkPermission('finance.manage'), asyncHandler(rejectLoan));

router.route('/reviews').get(checkPermission('teachers.view'), asyncHandler(getReviews)).post(checkPermission('teachers.manage'), asyncHandler(createReview));
router.route('/reviews/:id').put(checkPermission('teachers.manage'), asyncHandler(updateReview));

router.route('/contracts').get(checkPermission('teachers.view'), asyncHandler(getContracts)).post(checkPermission('teachers.manage'), asyncHandler(createContract));
router.route('/contracts/:id').put(checkPermission('teachers.manage'), asyncHandler(updateContract));

router.route('/job-postings').get(checkPermission('teachers.view'), asyncHandler(getJobPostings)).post(checkPermission('teachers.manage'), asyncHandler(createJobPosting));
router.route('/job-postings/:id').put(checkPermission('teachers.manage'), asyncHandler(updateJobPosting)).delete(checkPermission('teachers.manage'), asyncHandler(deleteJobPosting));

export default router;
