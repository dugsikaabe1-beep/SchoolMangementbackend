import asyncHandler from 'express-async-handler';
import Account from '../models/Account.js';
import JournalEntry from '../models/JournalEntry.js';
import FiscalPeriod from '../models/FiscalPeriod.js';
import { tenantFilter } from '../utils/tenantQuery.js';
import { logAction } from '../utils/auditLogger.js';

const ok = (res, data = {}) => res.json({ success: true, ...data });
const err = (res, s, msg) => res.status(s).json({ success: false, message: msg });

// ── CHART OF ACCOUNTS ────────────────────────────────────────────────────────

export const getAccounts = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { type, isActive, search } = req.query;
  if (type) filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { code: { $regex: search, $options: 'i' } }];

  const accounts = await Account.find(filter).populate('parent', 'name code').sort({ code: 1 }).lean();
  ok(res, { data: accounts });
});

export const createAccount = asyncHandler(async (req, res) => {
  const { code, name, type, subType, parent, description, openingBalance } = req.body;
  if (!code || !name || !type) return err(res, 400, 'Code, name, and type are required');
  const normalBalance = ['asset', 'expense'].includes(type) ? 'debit' : 'credit';
  const account = await Account.create({ ...tenantFilter(req), code, name, type, subType, parent, description, normalBalance, openingBalance, currentBalance: openingBalance || 0 });
  await logAction(req, { action: 'CREATE', module: 'ACCOUNT', targetId: account._id, newValue: account });
  ok(res, { data: account }, 201);
});

export const updateAccount = asyncHandler(async (req, res) => {
  const account = await Account.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!account) return err(res, 404, 'Account not found');
  ok(res, { data: account });
});

export const deleteAccount = asyncHandler(async (req, res) => {
  const account = await Account.findOne({ _id: req.params.id, ...tenantFilter(req), isDeleted: false });
  if (!account) return err(res, 404, 'Account not found');
  if (account.isSystem) return err(res, 400, 'Cannot delete system account');
  const hasJournals = await JournalEntry.countDocuments({ 'lines.account': account._id, isDeleted: false });
  if (hasJournals > 0) return err(res, 400, 'Cannot delete account with journal entries');
  account.isDeleted = true; await account.save();
  ok(res, { message: 'Account deleted' });
});

// ── JOURNAL ENTRIES ──────────────────────────────────────────────────────────

export const getJournalEntries = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { status, dateFrom, dateTo, accountId, source, page = 1, limit = 20 } = req.query;
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo) filter.date.$lte = new Date(dateTo);
  }
  if (accountId) filter['lines.account'] = accountId;

  const skip = (Number(page) - 1) * Number(limit);
  const [entries, total] = await Promise.all([
    JournalEntry.find(filter).populate('lines.account', 'name code').populate('postedBy', 'name').sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    JournalEntry.countDocuments(filter),
  ]);
  ok(res, { data: entries, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createJournalEntry = asyncHandler(async (req, res) => {
  const { date, reference, description, lines } = req.body;
  if (!description || !lines || lines.length < 2) return err(res, 400, 'Description and at least 2 lines required');
  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) return err(res, 400, 'Total debits must equal total credits');

  const count = await JournalEntry.countDocuments(tenantFilter(req));
  const entryNumber = `JE-${String(count + 1).padStart(6, '0')}`;
  const entry = await JournalEntry.create({ ...tenantFilter(req), academicYear: req.academicYearId, entryNumber, date: date || new Date(), reference, description, lines, totalDebit, totalCredit });
  await logAction(req, { action: 'CREATE', module: 'JOURNAL_ENTRY', targetId: entry._id, newValue: entry });
  ok(res, { data: entry }, 201);
});

export const postJournalEntry = asyncHandler(async (req, res) => {
  const entry = await JournalEntry.findOne({ _id: req.params.id, ...tenantFilter(req), isDeleted: false });
  if (!entry) return err(res, 404, 'Journal entry not found');
  if (entry.status !== 'draft') return err(res, 400, 'Only draft entries can be posted');

  for (const line of entry.lines) {
    const account = await Account.findById(line.account);
    if (account) {
      if (line.debit > 0) account.currentBalance += line.debit;
      if (line.credit > 0) account.currentBalance -= line.credit;
      await account.save();
    }
  }
  entry.status = 'posted'; entry.postedBy = req.user._id; entry.postedAt = new Date();
  await entry.save();
  await logAction(req, { action: 'POST', module: 'JOURNAL_ENTRY', targetId: entry._id });
  ok(res, { data: entry });
});

export const reverseJournalEntry = asyncHandler(async (req, res) => {
  const original = await JournalEntry.findOne({ _id: req.params.id, ...tenantFilter(req), isDeleted: false });
  if (!original) return err(res, 404, 'Journal entry not found');
  if (original.status !== 'posted') return err(res, 400, 'Only posted entries can be reversed');

  const reversedLines = original.lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit }));
  const count = await JournalEntry.countDocuments(tenantFilter(req));
  const reversal = await JournalEntry.create({
    ...tenantFilter(req), academicYear: original.academicYear, entryNumber: `REV-${String(count + 1).padStart(6, '0')}`,
    date: new Date(), description: `Reversal of ${original.entryNumber}: ${original.description}`,
    lines: reversedLines, totalDebit: original.totalCredit, totalCredit: original.totalDebit,
    source: 'adjustment', status: 'posted', postedBy: req.user._id, postedAt: new Date(), reverseOf: original._id,
  });

  for (const line of original.lines) {
    const account = await Account.findById(line.account);
    if (account) {
      if (line.debit > 0) account.currentBalance -= line.debit;
      if (line.credit > 0) account.currentBalance += line.credit;
      await account.save();
    }
  }
  original.status = 'reversed'; original.reversedBy = req.user._id; original.reversedAt = new Date();
  await original.save();
  ok(res, { data: reversal });
});

// ── REPORTS ──────────────────────────────────────────────────────────────────

export const getTrialBalance = asyncHandler(async (req, res) => {
  const accounts = await Account.find({ ...tenantFilter(req), isDeleted: false, isActive: true }).sort({ code: 1 }).lean();
  const debits = accounts.filter(a => a.currentBalance > 0).reduce((s, a) => s + a.currentBalance, 0);
  const credits = accounts.filter(a => a.currentBalance < 0).reduce((s, a) => s + Math.abs(a.currentBalance), 0);
  ok(res, { data: { accounts, totalDebits: Math.round(debits * 100) / 100, totalCredits: Math.round(credits * 100) / 100, balanced: Math.abs(debits - credits) < 0.01 } });
});

export const getProfitAndLoss = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  const accountFilter = { ...tenantFilter(req), isDeleted: false, type: { $in: ['revenue', 'expense'] } };
  const accounts = await Account.find(accountFilter).sort({ code: 1 }).lean();

  const revenueAccounts = accounts.filter(a => a.type === 'revenue');
  const expenseAccounts = accounts.filter(a => a.type === 'expense');
  const totalRevenue = revenueAccounts.reduce((s, a) => s + Math.abs(a.currentBalance), 0);
  const totalExpenses = expenseAccounts.reduce((s, a) => s + Math.abs(a.currentBalance), 0);
  ok(res, { data: { revenue: revenueAccounts, expenses: expenseAccounts, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses } });
});

export const getBalanceSheet = asyncHandler(async (req, res) => {
  const accounts = await Account.find({ ...tenantFilter(req), isDeleted: false, type: { $in: ['asset', 'liability', 'equity'] } }).sort({ code: 1 }).lean();
  const assets = accounts.filter(a => a.type === 'asset');
  const liabilities = accounts.filter(a => a.type === 'liability');
  const equity = accounts.filter(a => a.type === 'equity');
  const totalAssets = assets.reduce((s, a) => s + Math.abs(a.currentBalance), 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + Math.abs(a.currentBalance), 0);
  const totalEquity = equity.reduce((s, a) => s + Math.abs(a.currentBalance), 0);
  ok(res, { data: { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01 } });
});

export const getCashFlow = asyncHandler(async (req, res) => {
  const accounts = await Account.find({ ...tenantFilter(req), isDeleted: false, type: { $in: ['asset', 'liability', 'equity', 'revenue', 'expense'] } }).sort({ code: 1 }).lean();
  const cashAccounts = accounts.filter(a => a.subType === 'current_asset' && (a.name?.toLowerCase().includes('cash') || a.name?.toLowerCase().includes('bank')));
  const operatingIn = accounts.filter(a => a.type === 'revenue').reduce((s, a) => s + Math.abs(a.currentBalance), 0);
  const operatingOut = accounts.filter(a => a.type === 'expense').reduce((s, a) => s + Math.abs(a.currentBalance), 0);
  ok(res, { data: { cashAccounts, operatingCashFlow: operatingIn - operatingOut, totalCashBalance: cashAccounts.reduce((s, a) => s + a.currentBalance, 0) } });
});

// ── FISCAL PERIODS ───────────────────────────────────────────────────────────

export const getFiscalPeriods = asyncHandler(async (req, res) => {
  const periods = await FiscalPeriod.find({ ...tenantFilter(req), isDeleted: false }).sort({ startDate: -1 }).lean();
  ok(res, { data: periods });
});

export const createFiscalPeriod = asyncHandler(async (req, res) => {
  const { name, startDate, endDate } = req.body;
  if (!name || !startDate || !endDate) return err(res, 400, 'Name, start, and end dates required');
  const period = await FiscalPeriod.create({ ...tenantFilter(req), name, startDate, endDate });
  ok(res, { data: period }, 201);
});

export const closeFiscalPeriod = asyncHandler(async (req, res) => {
  const period = await FiscalPeriod.findOne({ _id: req.params.id, ...tenantFilter(req), isDeleted: false });
  if (!period) return err(res, 404, 'Period not found');
  if (period.status !== 'open') return err(res, 400, 'Period is not open');
  period.status = 'closed'; period.closedBy = req.user._id; period.closedAt = new Date();
  await period.save();
  ok(res, { data: period });
});
