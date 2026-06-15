import Plan from '../models/Plan.js';
import School from '../models/School.js';
import { logAction } from '../utils/auditLogger.js';

/**
 * @desc    Get all plans
 * @route   GET /api/v1/super-admin/plans
 * @access  Super Admin
 */
export const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find().sort({ monthlyPrice: 1 });
    res.json({ success: true, data: plans });
  } catch (error) {
    console.error('Get Plans Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get a single plan by ID
 * @route   GET /api/v1/super-admin/plans/:id
 * @access  Super Admin
 */
export const getPlanById = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Create a new plan
 * @route   POST /api/v1/super-admin/plans
 * @access  Super Admin
 */
export const createPlan = async (req, res) => {
  try {
    const { name, code, monthlyPrice, yearlyPrice, currency, limits, features, isRecommended, status } = req.body;

    if (!name || !code || monthlyPrice === undefined || yearlyPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name, code, monthlyPrice, and yearlyPrice are required.'
      });
    }

    const plan = await Plan.create({ name, code, monthlyPrice, yearlyPrice, currency, limits, features, isRecommended, status });

    await logAction(req, {
      action: 'PLAN_CREATED',
      module: 'SaaS',
      details: { planId: plan._id, name: plan.name },
      targetId: plan._id
    });

    res.status(201).json({ success: true, message: 'Plan created successfully.', data: plan });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A plan with that name or code already exists.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update a plan
 * @route   PUT /api/v1/super-admin/plans/:id
 * @access  Super Admin
 */
export const updatePlan = async (req, res) => {
  try {
    const oldPlan = await Plan.findById(req.params.id);
    if (!oldPlan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const oldFeatures = [...(oldPlan.features || [])];

    const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

    // If features changed, sync to all schools using this plan
    const newFeatures = plan.features || [];
    const featuresChanged = JSON.stringify(oldFeatures.sort()) !== JSON.stringify([...newFeatures].sort());

    if (featuresChanged) {
      const schools = await School.find({ 'subscription.plan': plan._id });
      for (const school of schools) {
        school.settings.enabledModules = [...newFeatures];
        await school.save();
      }

      await logAction(req, {
        action: 'PLAN_FEATURES_SYNCED',
        module: 'SaaS',
        details: {
          planId: plan._id,
          planName: plan.name,
          oldFeatures,
          newFeatures,
          schoolsAffected: schools.length,
        },
        targetId: plan._id,
        oldValue: oldFeatures,
        newValue: newFeatures,
      });
    }

    await logAction(req, {
      action: 'PLAN_UPDATED',
      module: 'SaaS',
      details: { planId: plan._id, name: plan.name, featuresChanged },
      targetId: plan._id
    });

    res.json({ success: true, message: 'Plan updated successfully.', data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Archive / toggle a plan's status
 * @route   DELETE /api/v1/super-admin/plans/:id
 * @access  Super Admin
 */
export const archivePlan = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    plan.status = plan.status === 'active' ? 'inactive' : 'active';
    await plan.save();

    await logAction(req, {
      action: 'PLAN_ARCHIVED',
      module: 'SaaS',
      details: { planId: plan._id, name: plan.name, newStatus: plan.status },
      targetId: plan._id
    });

    res.json({ success: true, message: `Plan ${plan.status === 'active' ? 'activated' : 'archived'} successfully.`, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Assign a plan to a school (upgrade/downgrade)
 * @route   POST /api/v1/super-admin/schools/:id/assign-plan
 * @access  Super Admin
 */
export const assignPlanToSchool = async (req, res) => {
  try {
    const { planId, billingInterval = 'monthly', endDate, paymentStatus = 'Paid' } = req.body;

    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });

    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const previousPlan = school.subscription?.plan;

    // Update subscription with plan limits (copy limits to isolate from future plan changes)
    school.subscription.plan = plan._id;
    school.subscription.type = billingInterval;
    school.subscription.status = 'Active';
    school.subscription.paymentStatus = paymentStatus;
    school.subscription.lastPaymentDate = new Date();
    school.subscription.amount = billingInterval === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
    school.subscription.currency = plan.currency;
    school.isActive = true;
    school.subscription.blockedByAdmin = false;

    // Sync features from the plan to school settings
    if (plan.features && plan.features.length > 0) {
      school.settings.enabledModules = [...plan.features];
    }

    // Copy limits from the plan so they are isolated going forward
    school.subscription.limits = {
      students: plan.limits.students,
      teachers: plan.limits.teachers,
      branches: plan.limits.branches,
      admins: plan.limits.admins,
      storage: plan.limits.storage,
      sms: plan.limits.sms,
      email: plan.limits.email,
    };

    // Calculate end date if not provided
    if (endDate) {
      school.subscription.endDate = new Date(endDate);
    } else {
      const now = new Date();
      if (billingInterval === 'yearly') {
        school.subscription.endDate = new Date(now.setFullYear(now.getFullYear() + 1));
      } else {
        school.subscription.endDate = new Date(now.setMonth(now.getMonth() + 1));
      }
    }

    await school.save();

    await logAction(req, {
      action: previousPlan ? 'PLAN_UPGRADED' : 'PLAN_ASSIGNED',
      module: 'SaaS',
      details: { schoolId: school._id, schoolName: school.name, previousPlan, newPlan: planId },
      targetId: school._id,
      oldValue: previousPlan,
      newValue: planId
    });

    res.json({
      success: true,
      message: `Plan "${plan.name}" assigned to ${school.name} successfully.`,
      data: school
    });
  } catch (error) {
    console.error('Assign Plan Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get SaaS analytics for Super Admin
 * @route   GET /api/v1/super-admin/analytics
 * @access  Super Admin
 */
export const getSaasAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // School counts
    const totalSchools = await School.countDocuments();
    const activeSchools = await School.countDocuments({ isActive: true, 'subscription.endDate': { $gte: now } });
    const expiredSchools = await School.countDocuments({ 'subscription.endDate': { $lt: now } });
    const trialSchools = await School.countDocuments({ 'subscription.type': 'trial' });
    const suspendedSchools = await School.countDocuments({ isActive: false, 'subscription.blockedByAdmin': true });

    // Revenue
    const [monthlyRevResult, annualRevResult] = await Promise.all([
      School.aggregate([{
        $match: { 'subscription.lastPaymentDate': { $gte: startOfMonth }, 'subscription.paymentStatus': 'Paid' }
      }, {
        $group: { _id: null, total: { $sum: '$subscription.amount' } }
      }]),
      School.aggregate([{
        $match: { 'subscription.lastPaymentDate': { $gte: startOfYear }, 'subscription.paymentStatus': 'Paid' }
      }, {
        $group: { _id: null, total: { $sum: '$subscription.amount' } }
      }])
    ]);

    const monthlyRevenue = monthlyRevResult[0]?.total || 0;
    const annualRevenue = annualRevResult[0]?.total || 0;

    // Subscription breakdown
    const subscriptionBreakdown = await School.aggregate([
      { $group: { _id: '$subscription.status', count: { $sum: 1 } } }
    ]);

    // Top schools (recently added, or high-value)
    const topSchools = await School.find({ isActive: true })
      .sort({ 'subscription.amount': -1 })
      .limit(5)
      .select('name email subscription.type subscription.status subscription.amount subscription.endDate subscription.plan')
      .populate('subscription.plan', 'name code');

    res.json({
      success: true,
      data: {
        schools: {
          total: totalSchools,
          active: activeSchools,
          expired: expiredSchools,
          trial: trialSchools,
          suspended: suspendedSchools,
        },
        revenue: {
          monthly: monthlyRevenue,
          annual: annualRevenue,
        },
        subscriptionBreakdown: subscriptionBreakdown.reduce((acc, curr) => {
          acc[curr._id || 'unknown'] = curr.count;
          return acc;
        }, {}),
        topSchools,
      }
    });
  } catch (error) {
    console.error('SaaS Analytics Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
