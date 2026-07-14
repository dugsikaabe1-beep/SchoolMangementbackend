import Expense from '../models/Expense.js';
import { tenantFilter } from '../utils/tenantQuery.js';
import { logAction } from '../utils/auditLogger.js';

const ok = (res, data = {}) => res.json({ success: true, ...data });
const err = (res, status, msg) => res.status(status).json({ success: false, message: msg });

export const getExpenses = async (req, res) => {
  const { search, category, status, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
  const filter = { ...tenantFilter(req), deletedAt: { $exists: false } };

  if (search) filter.title = { $regex: search, $options: 'i' };
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo) filter.date.$lte = new Date(dateTo);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [expenses, total] = await Promise.all([
    Expense.find(filter)
      .populate('createdBy', 'name')
      .sort({ date: -1 })
      .skip(skip).limit(Number(limit)),
    Expense.countDocuments(filter),
  ]);

  ok(res, { data: expenses, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
};

export const createExpense = async (req, res) => {
  const { title, description, amount, date, category, paymentMethod, receipt, status } = req.body;

  if (!title?.trim()) return err(res, 400, 'Title is required');
  if (amount === undefined || amount < 0) return err(res, 400, 'Valid amount is required');
  if (!date) return err(res, 400, 'Date is required');

  const expense = await Expense.create({
    school: req.schoolId,
    branch: req.branchId,
    academicYear: req.academicYear || '',
    title: title.trim(),
    description,
    amount,
    date,
    category: category || 'Other',
    paymentMethod: paymentMethod || 'Cash',
    receipt,
    status: status || 'Paid',
    createdBy: req.user._id,
  });

  logAction(req, { action: 'CREATE_EXPENSE', module: 'FINANCE', targetId: expense._id,
    details: { title, amount, category } });
  ok(res, { data: expense });
};

export const updateExpense = async (req, res) => {
  const existing = await Expense.findOne({
    ...tenantFilter(req), _id: req.params.id, deletedAt: { $exists: false },
  });
  if (!existing) return err(res, 404, 'Expense not found');

  const expense = await Expense.findOneAndUpdate(
    { ...tenantFilter(req), _id: req.params.id, deletedAt: { $exists: false } },
    { ...req.body, updatedBy: req.user._id },
    { new: true, runValidators: true }
  );

  logAction(req, { action: 'UPDATE_EXPENSE', module: 'FINANCE', targetId: expense._id });
  ok(res, { data: expense });
};

export const deleteExpense = async (req, res) => {
  const expense = await Expense.findOneAndUpdate(
    { ...tenantFilter(req), _id: req.params.id, deletedAt: { $exists: false } },
    { deletedAt: new Date(), deletedBy: req.user._id },
    { new: true }
  );
  if (!expense) return err(res, 404, 'Expense not found');

  logAction(req, { action: 'DELETE_EXPENSE', module: 'FINANCE', targetId: expense._id });
  ok(res, { message: 'Expense deleted' });
};

export const getExpenseStats = async (req, res) => {
  const filter = { ...tenantFilter(req), deletedAt: { $exists: false } };

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const monthlyFilter = { ...filter, date: { $gte: sixMonthsAgo } };

  const [totalResult, byCategory, byStatus, monthlyTrend] = await Promise.all([
    Expense.aggregate([
      { $match: filter },
      { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: filter },
      { $group: { _id: '$category', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { totalAmount: -1 } },
    ]),
    Expense.aggregate([
      { $match: filter },
      { $group: { _id: '$status', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: monthlyFilter },
      { $group: {
        _id: { year: { $year: '$date' }, month: { $month: '$date' } },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  ok(res, {
    data: {
      summary: totalResult[0] || { totalAmount: 0, count: 0 },
      byCategory,
      byStatus,
      monthlyTrend,
    },
  });
};
