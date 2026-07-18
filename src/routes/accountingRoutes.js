import express from 'express';
import { protect, checkPermission } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { checkModuleAccess } from '../middlewares/featureMiddleware.js';
import { checkSubscription } from '../middlewares/subscriptionMiddleware.js';
import { injectBranch, injectOwnership } from '../middlewares/tenantMiddleware.js';
import { auditMiddleware } from '../utils/auditLogger.js';
import { getAccounts, createAccount, updateAccount, deleteAccount, getJournalEntries, createJournalEntry, postJournalEntry, reverseJournalEntry, getTrialBalance, getProfitAndLoss, getBalanceSheet, getCashFlow, getFiscalPeriods, createFiscalPeriod, closeFiscalPeriod } from '../controllers/accountingController.js';

const router = express.Router();
router.use(asyncHandler(protect));
router.use(asyncHandler(injectBranch));
router.use(injectOwnership);
router.use(checkSubscription);
router.use(checkModuleAccess('enterprise-finance'));
router.use(auditMiddleware('ACCOUNTING'));

// Chart of Accounts
router.route('/accounts').get(checkPermission('finance.view'), asyncHandler(getAccounts)).post(checkPermission('finance.manage'), asyncHandler(createAccount));
router.route('/accounts/:id').put(checkPermission('finance.manage'), asyncHandler(updateAccount)).delete(checkPermission('finance.manage'), asyncHandler(deleteAccount));

// Journal Entries
router.route('/journal-entries').get(checkPermission('finance.view'), asyncHandler(getJournalEntries)).post(checkPermission('finance.manage'), asyncHandler(createJournalEntry));
router.post('/journal-entries/:id/post', checkPermission('finance.manage'), asyncHandler(postJournalEntry));
router.post('/journal-entries/:id/reverse', checkPermission('finance.manage'), asyncHandler(reverseJournalEntry));

// Reports
router.get('/trial-balance', checkPermission('finance.view'), asyncHandler(getTrialBalance));
router.get('/profit-and-loss', checkPermission('finance.view'), asyncHandler(getProfitAndLoss));
router.get('/balance-sheet', checkPermission('finance.view'), asyncHandler(getBalanceSheet));
router.get('/cash-flow', checkPermission('finance.view'), asyncHandler(getCashFlow));

// Fiscal Periods
router.route('/fiscal-periods').get(checkPermission('finance.view'), asyncHandler(getFiscalPeriods)).post(checkPermission('finance.manage'), asyncHandler(createFiscalPeriod));
router.post('/fiscal-periods/:id/close', checkPermission('finance.manage'), asyncHandler(closeFiscalPeriod));

export default router;
