import asyncHandler from 'express-async-handler';
import ApiKey from '../models/ApiKey.js';
import LoginHistory from '../models/LoginHistory.js';
import IpRestriction from '../models/IpRestriction.js';
import PasswordPolicy from '../models/PasswordPolicy.js';
import { tenantFilter } from '../utils/tenantQuery.js';
import crypto from 'crypto';

const ok = (res, data = {}) => res.json({ success: true, ...data });
const err = (res, s, msg) => res.status(s).json({ success: false, message: msg });

// ── API KEYS ─────────────────────────────────────────────────────────────────

export const getApiKeys = asyncHandler(async (req, res) => {
  const keys = await ApiKey.find({ ...tenantFilter(req), isDeleted: false }).select('-key').sort({ createdAt: -1 }).lean();
  ok(res, { data: keys });
});

export const createApiKey = asyncHandler(async (req, res) => {
  const { name, permissions, rateLimit, expiresAt, ipWhitelist } = req.body;
  if (!name) return err(res, 400, 'Name is required');
  const rawKey = crypto.randomBytes(32).toString('hex');
  const prefix = rawKey.substring(0, 8);
  const key = await ApiKey.create({ ...tenantFilter(req), name, key: rawKey, prefix, permissions, rateLimit, expiresAt, ipWhitelist, createdBy: req.user._id });
  ok(res, { data: { ...key.toObject(), key: rawKey } }, 201);
});

export const revokeApiKey = asyncHandler(async (req, res) => {
  const key = await ApiKey.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { status: 'revoked' }, { new: true });
  if (!key) return err(res, 404, 'API key not found');
  ok(res, { message: 'API key revoked' });
});

export const deleteApiKey = asyncHandler(async (req, res) => {
  const key = await ApiKey.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true }, { new: true });
  if (!key) return err(res, 404, 'API key not found');
  ok(res, { message: 'API key deleted' });
});

// ── LOGIN HISTORY ────────────────────────────────────────────────────────────

export const getLoginHistory = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req) };
  const { userId, status, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
  if (userId) filter.user = userId;
  if (status) filter.status = status;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [history, total] = await Promise.all([
    LoginHistory.find(filter).populate('user', 'name email').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    LoginHistory.countDocuments(filter),
  ]);
  ok(res, { data: history, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const getLoginStats = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req) };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [totalToday, successful, failed, blocked] = await Promise.all([
    LoginHistory.countDocuments({ ...filter, createdAt: { $gte: today } }),
    LoginHistory.countDocuments({ ...filter, status: 'success', createdAt: { $gte: today } }),
    LoginHistory.countDocuments({ ...filter, status: 'failed', createdAt: { $gte: today } }),
    LoginHistory.countDocuments({ ...filter, status: 'blocked', createdAt: { $gte: today } }),
  ]);
  ok(res, { data: { totalToday, successful, failed, blocked } });
});

// ── IP RESTRICTIONS ──────────────────────────────────────────────────────────

export const getIpRestrictions = asyncHandler(async (req, res) => {
  const restrictions = await IpRestriction.find({ ...tenantFilter(req), isDeleted: false }).sort({ createdAt: -1 }).lean();
  ok(res, { data: restrictions });
});

export const createIpRestriction = asyncHandler(async (req, res) => {
  const { name, ipAddress, cidr, type, description } = req.body;
  if (!name || !ipAddress) return err(res, 400, 'Name and IP address required');
  const restriction = await IpRestriction.create({ ...tenantFilter(req), name, ipAddress, cidr, type, description });
  ok(res, { data: restriction }, 201);
});

export const updateIpRestriction = asyncHandler(async (req, res) => {
  const restriction = await IpRestriction.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!restriction) return err(res, 404, 'IP restriction not found');
  ok(res, { data: restriction });
});

export const deleteIpRestriction = asyncHandler(async (req, res) => {
  const restriction = await IpRestriction.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true }, { new: true });
  if (!restriction) return err(res, 404, 'IP restriction not found');
  ok(res, { message: 'IP restriction deleted' });
});

// ── PASSWORD POLICY ──────────────────────────────────────────────────────────

export const getPasswordPolicy = asyncHandler(async (req, res) => {
  let policy = await PasswordPolicy.findOne(tenantFilter(req)).lean();
  if (!policy) {
    policy = await PasswordPolicy.create(tenantFilter(req));
  }
  ok(res, { data: policy });
});

export const updatePasswordPolicy = asyncHandler(async (req, res) => {
  let policy = await PasswordPolicy.findOne(tenantFilter(req));
  if (!policy) {
    policy = await PasswordPolicy.create({ ...tenantFilter(req), ...req.body });
  } else {
    Object.assign(policy, req.body);
    await policy.save();
  }
  ok(res, { data: policy });
});
