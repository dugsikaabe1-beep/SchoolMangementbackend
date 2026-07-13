import express from 'express';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { injectBranch, injectOwnership } from '../middlewares/tenantMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import {
  // Salary Structures
  getSalaryStructures,
  getSalaryStructureById,
  createSalaryStructure,
  updateSalaryStructure,
  deleteSalaryStructure,
  previewSalaryCalculation,
  // Payroll Records
  getPayrolls,
  getPayrollById,
  createPayroll,
  updatePayroll,
  deletePayroll,
  approvePayroll,
  markPayrollPaid,
  runBulkPayroll,
  getPayrollStats,
  downloadPayslip,
} from '../controllers/payrollController.js';

const router = express.Router();

router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(checkSubscription);
router.use(checkModuleAccess('payroll'));
router.use(auditMiddleware('PAYROLL'));

// ── Salary Structures ─────────────────────────────────────────────────────────
router.route('/salary-structures')
  .get(checkPermission('finance.view'),   asyncHandler(getSalaryStructures))
  .post(checkPermission('finance.manage'), asyncHandler(createSalaryStructure));

router.route('/salary-structures/:id')
  .get(checkPermission('finance.view'),    asyncHandler(getSalaryStructureById))
  .put(checkPermission('finance.manage'),  asyncHandler(updateSalaryStructure))
  .delete(checkPermission('finance.manage'), asyncHandler(deleteSalaryStructure));

router.post('/salary-structures/preview', checkPermission('finance.view'), asyncHandler(previewSalaryCalculation));

// ── Payroll Records ───────────────────────────────────────────────────────────
router.route('/')
  .get(checkPermission('finance.view'),    asyncHandler(getPayrolls))
  .post(checkPermission('finance.manage'), asyncHandler(createPayroll));

router.get('/stats', checkPermission('finance.view'), asyncHandler(getPayrollStats));

router.post('/bulk-run', checkPermission('finance.manage'), asyncHandler(runBulkPayroll));

router.route('/:id')
  .get(checkPermission('finance.view'),    asyncHandler(getPayrollById))
  .put(checkPermission('finance.manage'),  asyncHandler(updatePayroll))
  .delete(checkPermission('finance.manage'), asyncHandler(deletePayroll));

router.post('/:id/approve',  checkPermission('finance.manage'), asyncHandler(approvePayroll));
router.post('/:id/mark-paid', checkPermission('finance.manage'), asyncHandler(markPayrollPaid));
router.get('/:id/payslip',   checkPermission('finance.view'),   asyncHandler(downloadPayslip));

export default router;
