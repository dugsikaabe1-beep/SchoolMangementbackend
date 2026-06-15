import mongoose from 'mongoose';
import School from '../models/School.js';
import Plan from '../models/Plan.js';
import User from '../models/User.js';
import { getCurrentUsage } from '../middlewares/limitMiddleware.js';
import { broadcastNotification } from '../utils/notificationService.js';
import { logAction } from '../utils/auditLogger.js';

/**
 * Builds a usage metric object with percentage, remaining, and warning level.
 */
const buildMetric = (current, limit) => {
  const unlimited = limit === -1;
  const percentage = unlimited ? 0 : Math.min(100, Math.round((current / limit) * 100));
  const ratio = unlimited ? 0 : current / limit;
  return {
    current,
    limit,
    remaining: unlimited ? null : Math.max(0, limit - current),
    percentage,
    unlimited,
    warning: unlimited ? 'normal' : (
      current >= limit ? 'critical' :
      ratio >= 0.95 ? 'critical' :
      ratio >= 0.90 ? 'danger' :
      ratio >= 0.80 ? 'warning' : 'normal'
    ),
  };
};

/**
 * Computes the display subscription status from raw DB data.
 */
const computeStatus = (sub, daysLeft) => {
  if (sub?.blockedByAdmin) return 'Suspended';
  if (!sub?.endDate) return sub?.status || 'Trial';
  if (daysLeft !== null && daysLeft <= 0) return 'Expired';
  if (daysLeft !== null && daysLeft <= 30) return 'Expiring Soon';
  return sub?.status || 'Active';
};

/**
 * @desc    Get current subscription for a school (School Admin)
 * @route   GET /api/v1/subscription
 * @access  Private (School Admin)
 */
export const getSubscription = async (req, res) => {
  try {
    const school = await School.findById(req.schoolId || req.user?.school)
      .populate('subscription.plan', 'name code monthlyPrice yearlyPrice features limits isRecommended');

    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    const sub = school.subscription;
    const now = new Date();
    const endDate = sub?.endDate;
    const daysLeft = endDate ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : null;

    res.json({
      success: true,
      data: {
        plan: sub?.plan || null,
        type: sub?.type || 'trial',
        status: computeStatus(sub, daysLeft),
        paymentStatus: sub?.paymentStatus || 'Pending',
        startDate: sub?.startDate,
        endDate: sub?.endDate,
        daysLeft,
        limits: sub?.limits || {},
        amount: sub?.amount || 0,
        currency: sub?.currency || 'USD',
        blockedByAdmin: sub?.blockedByAdmin || false,
        blockedReason: sub?.blockedReason,
      }
    });
  } catch (error) {
    console.error('Get Subscription Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get current resource usage for the school
 * @route   GET /api/v1/subscription/usage
 * @access  Private (School Admin)
 */
export const getUsage = async (req, res) => {
  try {
    const schoolId = req.schoolId || req.user?.school;
    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    const limits = school.subscription?.limits || {};

    const [students, teachers, branches, admins] = await Promise.all([
      getCurrentUsage(schoolId, 'students'),
      getCurrentUsage(schoolId, 'teachers'),
      getCurrentUsage(schoolId, 'branches'),
      getCurrentUsage(schoolId, 'admins'),
    ]);

    res.json({
      success: true,
      data: {
        students: buildMetric(students, limits.students ?? 100),
        teachers: buildMetric(teachers, limits.teachers ?? 10),
        branches: buildMetric(branches, limits.branches ?? 1),
        admins: buildMetric(admins, limits.admins ?? 1),
        storage: buildMetric(0, limits.storage ?? 1024),
        sms: buildMetric(0, limits.sms ?? 100),
        email: buildMetric(0, limits.email ?? 1000),
      }
    });
  } catch (error) {
    console.error('Get Usage Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get combined subscription + usage in a single API call (dashboard optimized)
 * @route   GET /api/v1/subscription/summary
 * @access  Private (School Admin)
 */
export const getSubscriptionSummary = async (req, res) => {
  try {
    const schoolId = req.schoolId || req.user?.school;
    const school = await School.findById(schoolId)
      .populate('subscription.plan', 'name code monthlyPrice yearlyPrice features limits isRecommended');

    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    const sub = school.subscription;
    const now = new Date();
    const endDate = sub?.endDate;
    const daysLeft = endDate ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : null;
    const limits = sub?.limits || {};

    const [students, teachers, branches, admins] = await Promise.all([
      getCurrentUsage(schoolId, 'students'),
      getCurrentUsage(schoolId, 'teachers'),
      getCurrentUsage(schoolId, 'branches'),
      getCurrentUsage(schoolId, 'admins'),
    ]);

    res.json({
      success: true,
      data: {
        subscription: {
          plan: sub?.plan || null,
          type: sub?.type || 'trial',
          status: computeStatus(sub, daysLeft),
          paymentStatus: sub?.paymentStatus || 'Pending',
          startDate: sub?.startDate,
          endDate: sub?.endDate,
          daysLeft,
          limits: sub?.limits || {},
          amount: sub?.amount || 0,
          currency: sub?.currency || 'USD',
          blockedByAdmin: sub?.blockedByAdmin || false,
          blockedReason: sub?.blockedReason,
        },
        usage: {
          students: buildMetric(students, limits.students ?? 100),
          teachers: buildMetric(teachers, limits.teachers ?? 10),
          branches: buildMetric(branches, limits.branches ?? 1),
          admins: buildMetric(admins, limits.admins ?? 1),
          storage: buildMetric(0, limits.storage ?? 1024),
          sms: buildMetric(0, limits.sms ?? 100),
          email: buildMetric(0, limits.email ?? 1000),
        },
        schoolName: school.name,
        schoolLogo: school.logo,
      }
    });
  } catch (error) {
    console.error('Get Subscription Summary Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Request a plan upgrade (School Admin)
 * @route   POST /api/v1/subscription/upgrade-request
 * @access  Private (School Admin)
 */
export const requestUpgrade = async (req, res) => {
  try {
    const { desiredPlan, billingInterval = 'monthly', message } = req.body;
    const schoolId = req.schoolId || req.user?.school;

    if (!desiredPlan) {
      return res.status(400).json({ success: false, message: 'Please specify a desired plan.' });
    }

    // Try to find by code or by ID
    let planQuery = { status: 'active', code: desiredPlan.toUpperCase() };
    if (mongoose.isValidObjectId(desiredPlan)) {
      planQuery = { $or: [{ code: desiredPlan.toUpperCase() }, { _id: desiredPlan }], status: 'active' };
    }
    const plan = await Plan.findOne(planQuery);

    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found.' });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    // Audit log the upgrade request
    await logAction(req, {
      action: 'PLAN_UPGRADE_REQUESTED',
      module: 'SUBSCRIPTION',
      targetId: schoolId,
      details: {
        schoolName: school.name,
        currentPlan: school.subscription?.plan,
        desiredPlan: plan.name,
        desiredPlanCode: plan.code,
        billingInterval,
        message: message || 'No message provided',
      }
    });

    // Notify all Super Admins
    try {
      const superAdmins = await User.find({
        role: { $in: ['superadmin', 'super_admin'] },
        isSuperAdmin: true,
      }).select('_id');

      if (superAdmins.length > 0) {
        await broadcastNotification({
          recipientIds: superAdmins.map(sa => sa._id),
          schoolId,
          title: '📦 Plan Upgrade Request',
          message: `"${school.name}" has requested an upgrade to "${plan.name}" (${billingInterval}).${message ? ` Message: "${message}"` : ''}`,
          type: 'info',
        });
      }
    } catch (notifErr) {
      // Non-critical: log but don't fail the request
      console.error('[UpgradeRequest] Failed to send Super Admin notification:', notifErr.message);
    }

    res.json({
      success: true,
      message: `Your upgrade request to "${plan.name}" has been received. Our team will process it shortly.`,
      data: {
        requestedPlan: plan.name,
        requestedPlanCode: plan.code,
        requestedInterval: billingInterval,
        pricing: billingInterval === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice,
        currency: plan.currency,
      }
    });
  } catch (error) {
    console.error('Upgrade Request Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
