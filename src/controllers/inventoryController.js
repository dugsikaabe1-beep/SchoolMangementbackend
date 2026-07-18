import asyncHandler from 'express-async-handler';
import Supplier from '../models/Supplier.js';
import InventoryItem from '../models/InventoryItem.js';
import StockMovement from '../models/StockMovement.js';
import { tenantFilter } from '../utils/tenantQuery.js';
import { logAction } from '../utils/auditLogger.js';

const ok = (res, data = {}) => res.json({ success: true, ...data });
const err = (res, s, msg) => res.status(s).json({ success: false, message: msg });

// ── SUPPLIERS ────────────────────────────────────────────────────────────────

export const getSuppliers = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { status, category, search, page = 1, limit = 20 } = req.query;
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (search) filter.name = { $regex: search, $options: 'i' };
  const skip = (Number(page) - 1) * Number(limit);
  const [suppliers, total] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
    Supplier.countDocuments(filter),
  ]);
  ok(res, { data: suppliers, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createSupplier = asyncHandler(async (req, res) => {
  const { name, contactPerson, email, phone, address, category, taxId, paymentTerms } = req.body;
  if (!name) return err(res, 400, 'Name is required');
  const supplier = await Supplier.create({ ...tenantFilter(req), name, contactPerson, email, phone, address, category, taxId, paymentTerms });
  await logAction(req, { action: 'CREATE', module: 'SUPPLIER', targetId: supplier._id });
  ok(res, { data: supplier }, 201);
});

export const updateSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!supplier) return err(res, 404, 'Supplier not found');
  ok(res, { data: supplier });
});

export const deleteSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true }, { new: true });
  if (!supplier) return err(res, 404, 'Supplier not found');
  ok(res, { message: 'Supplier deleted' });
});

// ── INVENTORY ITEMS ──────────────────────────────────────────────────────────

export const getInventoryItems = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { category, status, search, lowStock, page = 1, limit = 20 } = req.query;
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { code: { $regex: search, $options: 'i' } }];
  if (lowStock === 'true') filter.$expr = { $lte: ['$quantity', '$minStock'] };

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    InventoryItem.find(filter).populate('supplier', 'name').sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
    InventoryItem.countDocuments(filter),
  ]);
  ok(res, { data: items, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createInventoryItem = asyncHandler(async (req, res) => {
  const { name, code, category, description, unit, quantity, minStock, maxStock, unitPrice, supplier, location } = req.body;
  if (!name || !category) return err(res, 400, 'Name and category required');
  const status = quantity <= 0 ? 'out_of_stock' : quantity <= (minStock || 0) ? 'low_stock' : 'in_stock';
  const item = await InventoryItem.create({ ...tenantFilter(req), name, code, category, description, unit, quantity, minStock, maxStock, unitPrice, supplier, location, status });
  if (quantity > 0) {
    await StockMovement.create({ ...tenantFilter(req), item: item._id, type: 'in', quantity, unitPrice, totalValue: (quantity || 0) * (unitPrice || 0), date: new Date(), notes: 'Initial stock', approvedBy: req.user._id });
  }
  await logAction(req, { action: 'CREATE', module: 'INVENTORY_ITEM', targetId: item._id });
  ok(res, { data: item }, 201);
});

export const updateInventoryItem = asyncHandler(async (req, res) => {
  const item = await InventoryItem.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!item) return err(res, 404, 'Item not found');
  ok(res, { data: item });
});

export const deleteInventoryItem = asyncHandler(async (req, res) => {
  const item = await InventoryItem.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true }, { new: true });
  if (!item) return err(res, 404, 'Item not found');
  ok(res, { message: 'Item deleted' });
});

// ── STOCK MOVEMENTS ──────────────────────────────────────────────────────────

export const getStockMovements = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { itemId, type, page = 1, limit = 20 } = req.query;
  if (itemId) filter.item = itemId;
  if (type) filter.type = type;
  const skip = (Number(page) - 1) * Number(limit);
  const [movements, total] = await Promise.all([
    StockMovement.find(filter).populate('item', 'name code').populate('issuedTo', 'name').populate('supplier', 'name').sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    StockMovement.countDocuments(filter),
  ]);
  ok(res, { data: movements, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createStockMovement = asyncHandler(async (req, res) => {
  const { itemId, type, quantity, unitPrice, reference, issuedTo, supplier, notes } = req.body;
  if (!itemId || !type || !quantity) return err(res, 400, 'Item, type, and quantity required');
  const item = await InventoryItem.findOne({ _id: itemId, ...tenantFilter(req), isDeleted: false });
  if (!item) return err(res, 404, 'Item not found');

  if (type === 'in' || type === 'return') item.quantity += quantity;
  else if (type === 'out' || type === 'adjustment') {
    if (item.quantity < quantity) return err(res, 400, 'Insufficient stock');
    item.quantity -= quantity;
  }
  item.status = item.quantity <= 0 ? 'out_of_stock' : item.quantity <= (item.minStock || 0) ? 'low_stock' : 'in_stock';
  await item.save();

  const totalValue = quantity * (unitPrice || 0);
  const movement = await StockMovement.create({ ...tenantFilter(req), item: itemId, type, quantity, unitPrice, totalValue, reference, issuedTo, supplier, notes, approvedBy: req.user._id });
  ok(res, { data: movement, newItem: item }, 201);
});

export const getInventoryStats = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const items = await InventoryItem.find(filter).lean();
  const totalItems = items.length;
  const totalValue = items.reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 0), 0);
  const lowStock = items.filter(i => i.quantity <= (i.minStock || 0) && i.quantity > 0).length;
  const outOfStock = items.filter(i => i.quantity <= 0).length;
  const byCategory = {};
  for (const i of items) { byCategory[i.category] = (byCategory[i.category] || 0) + 1; }
  ok(res, { data: { totalItems, totalValue, lowStock, outOfStock, byCategory } });
});
