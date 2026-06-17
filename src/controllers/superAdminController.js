import School from '../models/School.js';
import User from '../models/User.js';
import SupportTicket from '../models/SupportTicket.js';
import Lead from '../models/Lead.js';
import SystemAnnouncement from '../models/SystemAnnouncement.js';
import KnowledgeBase from '../models/KnowledgeBase.js';
import SystemIntegration from '../models/SystemIntegration.js';
import SystemConfig from '../models/SystemConfig.js';
import BackupRecord from '../models/BackupRecord.js';
import Plan from '../models/Plan.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import os from 'os';
import { logAction } from '../utils/auditLogger.js';
import { generateOTP, hashOTP, sendOTPEmail } from '../utils/twoFactorUtils.js';
import {
  generateAccessToken,
  generateRefreshToken,
  setTokenCookies,
} from '../utils/tokenUtils.js';

const SUPER_ADMIN_ROLES = ['superadmin', 'super_admin'];
const SCHOOL_ADMIN_ROLES = ['schooladmin', 'school_admin'];

const isSuperAdminUser = (user) =>
  SUPER_ADMIN_ROLES.includes(user?.role) || user?.isSuperAdmin === true;

import { sendVerificationEmail } from '../utils/emailService.js';
import crypto from 'crypto';

// --- Super Admin Login ---
export const superAdminLogin = async (req, res) => {
  let { email, password } = req.body;
  email = email ? email.trim().toLowerCase() : '';

  if (!email || !password) {
    return res.status(400).json({
      message: 'Missing credentials',
      userMessage: 'Email and password are required.',
    });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        message: 'Invalid credentials',
        userMessage: 'Invalid email or password.',
      });
    }

    if (!isSuperAdminUser(user)) {
      if (SCHOOL_ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({
          message: 'Wrong login portal',
          userMessage:
            'This email is a school admin account. Use School Login at /login (not Super Admin).',
          accountType: 'schooladmin',
          redirectTo: '/login',
        });
      }
      return res.status(401).json({
        message: 'Invalid credentials',
        userMessage: 'Invalid email or password.',
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        message: 'Invalid credentials',
        userMessage: 'Invalid email or password.',
      });
    }

    // --- 2FA for Super Admin Login ---
    const otp = generateOTP();
    user.otp = await hashOTP(otp);
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.otpAttempts = 0;
    await user.save();

    await sendOTPEmail(user.email, otp, user);

    await logAction(req, {
      action: 'SUPER_ADMIN_LOGIN_PENDING_2FA',
      module: 'AUTH',
      details: { email: user.email }
    });

    return res.json({
      requires2FA: true,
      userId: user._id,
      email: user.email.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => gp2 + '*'.repeat(gp3.length)),
      message: 'A verification code has been sent to your super admin email.'
    });
  } catch (error) {
    console.error('Super Admin Login Error:', error);
    res.status(500).json({
      message: 'Login failed',
      userMessage: 'An error occurred during login. Please try again.'
    });
  }
};

// --- CRM & Lead Management ---
export const getLeads = async (req, res) => {
  try {
    const leads = await Lead.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateLead = async (req, res) => {
  const { id } = req.params;
  try {
    const lead = await Lead.findByIdAndUpdate(id, req.body, { new: true });
    res.json(lead);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- System Announcements & Feature Releases ---
export const createSystemAnnouncement = async (req, res) => {
  try {
    const announcement = await SystemAnnouncement.create({
      ...req.body,
      createdBy: req.user._id,
      publishedAt: req.body.isPublished ? new Date() : null
    });
    res.status(201).json(announcement);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSystemAnnouncements = async (req, res) => {
  try {
    const announcements = await SystemAnnouncement.find().sort({ createdAt: -1 });
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Knowledge Base ---
export const manageKnowledgeBase = async (req, res) => {
  try {
    const { action, id, data } = req.body;
    if (action === 'create') {
      const article = await KnowledgeBase.create({ ...data, createdBy: req.user._id });
      return res.status(201).json(article);
    }
    if (action === 'update') {
      const article = await KnowledgeBase.findByIdAndUpdate(id, data, { new: true });
      return res.json(article);
    }
    if (action === 'delete') {
      await KnowledgeBase.findByIdAndDelete(id);
      return res.json({ message: 'Article deleted' });
    }
    const articles = await KnowledgeBase.find().sort({ category: 1, title: 1 });
    res.json(articles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Maintenance Mode ---
export const toggleMaintenanceMode = async (req, res) => {
  const { isEnabled } = req.body;
  try {
    const config = await SystemConfig.findOneAndUpdate(
      { key: 'maintenance_mode' },
      { value: isEnabled, updatedBy: req.user._id },
      { upsert: true, new: true }
    );
    res.json({ message: `Maintenance mode ${isEnabled ? 'enabled' : 'disabled'}`, config });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Integration & Gateway Management ---
export const manageIntegrations = async (req, res) => {
  try {
    const integrations = await SystemIntegration.find();
    res.json(integrations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateIntegration = async (req, res) => {
  const { id } = req.params;
  try {
    const integration = await SystemIntegration.findByIdAndUpdate(
      id,
      { ...req.body, updatedBy: req.user._id },
      { new: true }
    );
    res.json(integration);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Disaster Recovery Center ---
export const getDisasterRecoveryStatus = async (req, res) => {
  try {
    const lastBackup = await BackupRecord.findOne().sort({ createdAt: -1 });
    const recoveryLogs = await BackupRecord.find().sort({ createdAt: -1 }).limit(10);
    res.json({
      lastBackup,
      recoveryLogs,
      recoveryHealth: 'Excellent' // Placeholder for real health check logic
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Customer Success & Enhanced Analytics ---
export const getSuperAdminAnalytics = async (req, res) => {
  try {
    const totalSchools = await School.countDocuments();
    const activeSchools = await School.countDocuments({ isActive: true });
    const trialSchools = await School.countDocuments({ 'subscription.status': 'Trial' });
    const expiredSchools = await School.countDocuments({ 'subscription.status': 'Expired' });
    
    const revenueStats = await School.aggregate([
      { $match: { 'subscription.paymentStatus': 'Paid' } },
      { $group: { _id: null, monthly: { $sum: '$subscription.amount' } } }
    ]);

    const planDistribution = await School.aggregate([
      { $group: { _id: '$subscription.plan', count: { $sum: 1 } } }
    ]);

    res.json({
      overview: {
        totalSchools,
        activeSchools,
        trialSchools,
        expiredSchools,
        monthlyRevenue: revenueStats[0]?.monthly || 0
      },
      planDistribution,
      riskSchools: await School.find({ 'subscription.status': 'Expiring Soon' }).limit(5)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Get All Schools (with filters) ---
export const getAllSchools = async (req, res) => {
  try {
    const { 
      status, 
      paymentStatus, 
      subscriptionType, 
      search,
      isBlocked,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    // Build filter
    const filter = {};
    
    if (status) filter.status = status;
    if (paymentStatus) filter['subscription.paymentStatus'] = paymentStatus;
    if (subscriptionType) filter['subscription.type'] = subscriptionType;
    if (isBlocked !== undefined) {
      if (isBlocked === 'true') {
        filter.$or = [
          { 'subscription.blockedByAdmin': true },
          { isActive: false }
        ];
      }
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const schoolsRaw = await School.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-__v')
      .lean();

    const rootDomain = (process.env.ROOT_DOMAIN || '').trim();

    const schools = schoolsRaw.map((s) => ({
      ...s,
      schoolId: s._id,
      tenantId: s.subdomain,
      primaryUrl: rootDomain ? `https://${s.subdomain}.${rootDomain}` : null,
    }));

    const count = await School.countDocuments(filter);

    res.json({
      schools,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    console.error('Get All Schools Error:', error);
    res.status(500).json({
      message: 'Failed to fetch schools',
      userMessage: 'Failed to fetch schools. Please try again.'
    });
  }
};

// --- Get School by ID ---
export const getSchoolById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const school = await School.findById(id)
      .populate('createdBy', 'name email')
      .populate('admin', 'name email');

    if (!school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'School not found.'
      });
    }

    // Get school stats
    const studentCount = await User.countDocuments({ 
      role: 'student', 
      school: id 
    });
    
    const teacherCount = await User.countDocuments({ 
      role: 'teacher', 
      school: id 
    });
    
    const adminCount = await User.countDocuments({ 
      role: 'schooladmin',
      school: id 
    });

    res.json({
      school,
      stats: {
        students: studentCount,
        teachers: teacherCount,
        admins: adminCount
      }
    });
  } catch (error) {
    console.error('Get School Error:', error);
    res.status(500).json({
      message: 'Failed to fetch school',
      userMessage: 'Failed to fetch school details. Please try again.'
    });
  }
};

// --- Update School ---
export const updateSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Prevent updating sensitive fields directly
    delete updates.subscription;
    delete updates._id;
    delete updates.createdAt;

    const school = await School.findByIdAndUpdate(
      id,
      { ...updates, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    if (!school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'School not found.'
      });
    }

    res.json({
      message: 'School updated successfully',
      userMessage: 'School updated successfully.',
      school
    });
  } catch (error) {
    console.error('Update School Error:', error);
    res.status(500).json({
      message: 'Failed to update school',
      userMessage: 'Failed to update school. Please try again.'
    });
  }
};

// --- Update School Subscription ---
export const updateSchoolSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      type, 
      endDate, 
      paymentStatus, 
      amount, 
      autoRenew 
    } = req.body;

    const school = await School.findById(id);

    if (!school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'School not found.'
      });
    }

    // Update subscription fields
    if (type) school.subscription.type = type;
    if (endDate) school.subscription.endDate = new Date(endDate);
    if (paymentStatus) school.subscription.paymentStatus = paymentStatus;
    if (amount !== undefined) school.subscription.amount = amount;
    if (autoRenew !== undefined) school.subscription.autoRenew = autoRenew;
    
    // If marking as paid, update last payment date
    if (paymentStatus === 'Paid') {
      school.subscription.lastPaymentDate = new Date();
    }

    await school.save();

    res.json({
      message: 'Subscription updated successfully',
      userMessage: `Subscription for ${school.name} has been updated successfully.`,
      school
    });
  } catch (error) {
    console.error('Update Subscription Error:', error);
    res.status(500).json({
      message: 'Failed to update subscription',
      userMessage: 'Failed to update subscription. Please try again.'
    });
  }
};

// --- Block/Unblock School ---
export const toggleSchoolBlock = async (req, res) => {
  try {
    const { id } = req.params;
    const { block, reason } = req.body;

    const school = await School.findById(id);

    if (!school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'School not found.'
      });
    }

    if (block) {
      school.subscription.blockedByAdmin = true;
      school.subscription.blockedReason = reason || 'Blocked by administrator';
      school.subscription.blockedAt = new Date();
      school.isActive = false;
    } else {
      school.subscription.blockedByAdmin = false;
      school.subscription.blockedReason = undefined;
      school.subscription.blockedAt = undefined;
      school.isActive = true;
    }

    await school.save();

    res.json({
      message: block ? 'School blocked successfully' : 'School unblocked successfully',
      userMessage: `${school.name} has been ${block ? 'blocked' : 'unblocked'} successfully.`,
      school
    });
  } catch (error) {
    console.error('Toggle Block Error:', error);
    res.status(500).json({
      message: 'Failed to update school status',
      userMessage: 'Failed to update school status. Please try again.'
    });
  }
};

// --- Delete School ---
export const deleteSchool = async (req, res) => {
  try {
    const { id } = req.params;

    const school = await School.findById(id);

    if (!school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'School not found.'
      });
    }

    // Optional: Check if school has users before deleting
    const userCount = await User.countDocuments({ school: id });
    
    if (userCount > 0) {
      return res.status(400).json({
        message: 'Cannot delete school with existing users',
        userMessage: `Cannot delete ${school.name} because it has ${userCount} users. Please delete all users first or deactivate the school instead.`
      });
    }

    await School.findByIdAndDelete(id);

    res.json({
      message: 'School deleted successfully',
      userMessage: `${school.name} has been deleted successfully.`
    });
  } catch (error) {
    console.error('Delete School Error:', error);
    res.status(500).json({
      message: 'Failed to delete school',
      userMessage: 'Failed to delete school. Please try again.'
    });
  }
};

// --- Get System Health ---
export const getSystemHealth = async (req, res) => {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Database status
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    
    // Storage usage (approximate if using local, or Cloudinary stats if integrated)
    // For now, providing basic server info
    const serverInfo = {
      platform: os.platform(),
      release: os.release(),
      totalMem: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
      freeMem: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
      cpus: os.cpus().length
    };

    // Error rates (from Audit Logs or a dedicated Error log)
    const AuditLog = (await import('../models/AuditLog.js')).default;
    const errorsLast24h = await AuditLog.countDocuments({
      severity: 'critical',
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    res.json({
      status: 'Healthy',
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      database: dbStatus,
      memory: {
        heapUsed: (memoryUsage.heapUsed / (1024 * 1024)).toFixed(2) + ' MB',
        heapTotal: (memoryUsage.heapTotal / (1024 * 1024)).toFixed(2) + ' MB',
        rss: (memoryUsage.rss / (1024 * 1024)).toFixed(2) + ' MB'
      },
      server: serverInfo,
      monitoring: {
        errorsLast24h,
        activeSessions: await User.countDocuments({ 'refreshTokens.0': { $exists: true } })
      }
    });
  } catch (error) {
    console.error('System Health Error:', error);
    res.status(500).json({ message: 'Failed to fetch system health' });
  }
};

// --- Get Business Analytics ---
export const getBusinessAnalytics = async (req, res) => {
  try {
    const totalSchools = await School.countDocuments();
    const activeSchools = await School.countDocuments({ isActive: true });
    
    // Revenue Trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const revenueTrends = await School.aggregate([
      {
        $match: {
          'subscription.lastPaymentDate': { $gte: sixMonthsAgo },
          'subscription.paymentStatus': 'Paid'
        }
      },
      {
        $group: {
          _id: { 
            month: { $month: '$subscription.lastPaymentDate' },
            year: { $year: '$subscription.lastPaymentDate' }
          },
          revenue: { $sum: '$subscription.amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Conversion Rates (Leads to Schools)
    const totalLeads = await Lead.countDocuments();
    const convertedLeads = await Lead.countDocuments({ status: 'converted' });
    
    // User Engagement (logins last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsersLast7d = await User.countDocuments({
      lastLogin: { $gte: sevenDaysAgo }
    });

    res.json({
      summary: {
        totalSchools,
        activeSchools,
        totalLeads,
        conversionRate: totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(2) + '%' : '0%',
        activeUsersLast7d
      },
      revenueTrends,
      supportStats: {
        openTickets: await SupportTicket.countDocuments({ status: 'open' }),
        pendingTickets: await SupportTicket.countDocuments({ status: 'in_progress' }),
        resolvedLast30d: await SupportTicket.countDocuments({ 
          status: 'resolved',
          updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        })
      }
    });
  } catch (error) {
    console.error('Business Analytics Error:', error);
    res.status(500).json({ message: 'Failed to fetch business analytics' });
  }
};

// --- Get Dashboard Stats ---
export const getDashboardStats = async (req, res) => {
  try {
    const totalSchools = await School.countDocuments();
    const activeSchools = await School.countDocuments({ isActive: true });
    const inactiveSchools = await School.countDocuments({ isActive: false });
    
    // Platform-wide counts
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalTeachers = await User.countDocuments({ role: 'teacher' });
    
    // Schools with expired subscriptions
    const expiredSchools = await School.countDocuments({
      'subscription.endDate': { $lt: new Date() },
      'subscription.blockedByAdmin': { $ne: true }
    });

    // Schools blocked by admin
    const blockedSchools = await School.countDocuments({
      'subscription.blockedByAdmin': true
    });

    // Revenue calculation (from subscription amounts)
    const revenueAggregation = await School.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$subscription.amount' },
          paidRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$subscription.paymentStatus', 'Paid'] },
                '$subscription.amount',
                0
              ]
            }
          }
        }
      }
    ]);

    const totalRevenue = revenueAggregation[0]?.totalRevenue || 0;
    const paidRevenue = revenueAggregation[0]?.paidRevenue || 0;

    // Recent schools (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentSchools = await School.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Subscription types breakdown
    const subscriptionTypes = await School.aggregate([
      {
        $group: {
          _id: '$subscription.type',
          count: { $sum: 1 }
        }
      }
    ]);

    // Top 5 schools by student usage
    const topSchools = await User.aggregate([
      { $match: { role: 'student', isDeleted: { $ne: true } } },
      { $group: { _id: '$school', studentCount: { $sum: 1 } } },
      { $sort: { studentCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'schools',
          localField: '_id',
          foreignField: '_id',
          as: 'schoolDetails'
        }
      },
      { $unwind: '$schoolDetails' },
      {
        $project: {
          _id: 1,
          name: '$schoolDetails.name',
          subdomain: '$schoolDetails.subdomain',
          status: '$schoolDetails.subscription.status',
          studentCount: 1,
          limit: '$schoolDetails.subscription.limits.students'
        }
      }
    ]);

    // Check maintenance mode status
    const SystemConfig = (await import('../models/SystemConfig.js')).default;
    const maintenanceConfig = await SystemConfig.findOne({ key: 'maintenance_mode' });

    res.json({
      success: true,
      maintenanceMode: maintenanceConfig?.value === true,
      schools: {
        total: totalSchools,
        active: activeSchools,
        inactive: inactiveSchools,
        expired: expiredSchools,
        blocked: blockedSchools,
        recent: recentSchools
      },
      revenue: {
        total: totalRevenue,
        paid: paidRevenue,
        pending: totalRevenue - paidRevenue
      },
      platform: {
        totalStudents,
        totalTeachers
      },
      subscriptionTypes: subscriptionTypes.reduce((acc, curr) => {
        acc[curr._id || 'trial'] = curr.count;
        return acc;
      }, {}),
      topSchools
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    res.status(500).json({
      message: 'Failed to fetch dashboard stats',
      userMessage: 'Failed to fetch dashboard statistics. Please try again.'
    });
  }
};

// --- Extend Subscription ---
export const extendSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { months, years } = req.body;

    const school = await School.findById(id);

    if (!school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'School not found.'
      });
    }

    // Calculate new end date
    let currentEndDate = school.subscription.endDate || new Date();
    
    // If subscription already expired, start from today
    if (currentEndDate < new Date()) {
      currentEndDate = new Date();
    }

    const newEndDate = new Date(currentEndDate);
    
    if (months) {
      newEndDate.setMonth(newEndDate.getMonth() + parseInt(months));
    }
    
    if (years) {
      newEndDate.setFullYear(newEndDate.getFullYear() + parseInt(years));
    }

    school.subscription.endDate = newEndDate;
    school.subscription.paymentStatus = 'Paid';
    school.subscription.lastPaymentDate = new Date();
    school.isActive = true;
    school.subscription.blockedByAdmin = false;

    await school.save();

    res.json({
      message: 'Subscription extended successfully',
      userMessage: `Subscription for ${school.name} has been extended until ${newEndDate.toLocaleDateString()}.`,
      school
    });
  } catch (error) {
    console.error('Extend Subscription Error:', error);
    res.status(500).json({
      message: 'Failed to extend subscription',
      userMessage: 'Failed to extend subscription. Please try again.'
    });
  }
};

// --- Check if Super Admin exists ---
export const checkSuperAdminExists = async (req, res) => {
  try {
    const superAdmin = await User.findOne({ isSuperAdmin: true });
    res.json({ exists: !!superAdmin });
  } catch (error) {
    console.error('Check Super Admin Error:', error);
    res.status(500).json({
      message: 'Failed to check Super Admin status',
      userMessage: 'An error occurred. Please try again.'
    });
  }
};

// --- Super Admin Registration ---
export const registerSuperAdmin = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Check if a Super Admin already exists
    const existingSuperAdmin = await User.findOne({ isSuperAdmin: true });
    if (existingSuperAdmin) {
      return res.status(403).json({
        message: 'Super Admin already exists',
        userMessage: 'A Super Admin account already exists. Only one Super Admin is allowed.'
      });
    }

    // Check if email is already in use
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        message: 'Email already registered',
        userMessage: 'This email is already registered.'
      });
    }

    // Create Super Admin
    const superAdmin = await User.create({
      name,
      email,
      password,
      role: 'superadmin',
      isSuperAdmin: true,
      status: 'active'
    });

    const access = generateAccessToken(superAdmin);
    setTokenCookies(res, generateRefreshToken(superAdmin));

    res.status(201).json({
      message: 'Super Admin created successfully',
      userMessage: 'Super Admin account created successfully!',
      user: {
        _id: superAdmin._id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role,
        isSuperAdmin: true,
        token: access,
      },
    });
  } catch (error) {
    console.error('Super Admin Registration Error:', error);
    // Return more detailed error message for debugging
    const errorMessage = error.message || 'Unknown error';
    res.status(500).json({
      message: `Failed to create Super Admin: ${errorMessage}`,
      userMessage: `Failed to create Super Admin: ${errorMessage}`
    });
  }
};

// --- Get All School Admins ---
export const getAllSchoolAdmins = async (req, res) => {
  try {
    const { schoolId, search, status } = req.query;
    
    const filter = { role: 'schooladmin' };
    
    if (schoolId) filter.school = schoolId;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const admins = await User.find(filter)
      .populate('school', 'name email')
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({ admins });
  } catch (error) {
    console.error('Get School Admins Error:', error);
    res.status(500).json({
      message: 'Failed to fetch school admins',
      userMessage: 'Failed to fetch school admins. Please try again.'
    });
  }
};

// --- Get Single School Admin ---
export const getSchoolAdminById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await User.findOne({ _id: id, role: 'schooladmin' })
      .populate('school', 'name email')
      .select('-password');

    if (!admin) {
      return res.status(404).json({
        message: 'School admin not found',
        userMessage: 'School admin not found.'
      });
    }

    res.json({ admin });
  } catch (error) {
    console.error('Get School Admin Error:', error);
    res.status(500).json({
      message: 'Failed to fetch school admin',
      userMessage: 'Failed to fetch school admin. Please try again.'
    });
  }
};

// --- Update School Admin ---
export const updateSchoolAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, schoolId } = req.body;

    const admin = await User.findOne({ _id: id, role: 'schooladmin' });

    if (!admin) {
      return res.status(404).json({
        message: 'School admin not found',
        userMessage: 'School admin not found.'
      });
    }

    // Check if email is already in use by another user
    if (email && email !== admin.email) {
      const emailExists = await User.findOne({ email, _id: { $ne: id } });
      if (emailExists) {
        return res.status(400).json({
          message: 'Email already in use',
          userMessage: 'This email is already registered to another user.'
        });
      }
    }

    // Update fields
    if (name) admin.name = name;
    if (email) admin.email = email;
    if (schoolId) admin.school = schoolId;

    await admin.save();

    res.json({
      message: 'School admin updated successfully',
      userMessage: 'School admin updated successfully.',
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        school: admin.school,
        status: admin.status
      }
    });
  } catch (error) {
    console.error('Update School Admin Error:', error);
    res.status(500).json({
      message: 'Failed to update school admin',
      userMessage: 'Failed to update school admin. Please try again.'
    });
  }
};

// --- Reset School Admin Password ---
export const resetSchoolAdminPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        message: 'Invalid password',
        userMessage: 'Password must be at least 6 characters long.'
      });
    }

    const admin = await User.findOne({ _id: id, role: 'schooladmin' });

    if (!admin) {
      return res.status(404).json({
        message: 'School admin not found',
        userMessage: 'School admin not found.'
      });
    }

    admin.password = newPassword;
    await admin.save();

    res.json({
      message: 'Password reset successfully',
      userMessage: `Password for ${admin.name} has been reset successfully.`
    });
  } catch (error) {
    console.error('Reset Password Error:', error);
    res.status(500).json({
      message: 'Failed to reset password',
      userMessage: 'Failed to reset password. Please try again.'
    });
  }
};

// --- Toggle School Admin Status (Activate/Deactivate) ---
export const toggleSchoolAdminStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await User.findOne({ _id: id, role: 'schooladmin' });

    if (!admin) {
      return res.status(404).json({
        message: 'School admin not found',
        userMessage: 'School admin not found.'
      });
    }

    // Toggle status
    admin.status = admin.status === 'active' ? 'inactive' : 'active';
    await admin.save();

    res.json({
      message: `School admin ${admin.status === 'active' ? 'activated' : 'deactivated'} successfully`,
      userMessage: `${admin.name} has been ${admin.status === 'active' ? 'activated' : 'deactivated'}.`,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        status: admin.status
      }
    });
  } catch (error) {
    console.error('Toggle Status Error:', error);
    res.status(500).json({
      message: 'Failed to update status',
      userMessage: 'Failed to update status. Please try again.'
    });
  }
};

// --- Delete School Admin ---
export const deleteSchoolAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await User.findOne({ _id: id, role: 'schooladmin' });

    if (!admin) {
      return res.status(404).json({
        message: 'School admin not found',
        userMessage: 'School admin not found.'
      });
    }

    await User.findByIdAndDelete(id);

    res.json({
      message: 'School admin deleted successfully',
      userMessage: `${admin.name} has been deleted successfully.`
    });
  } catch (error) {
    console.error('Delete School Admin Error:', error);
    res.status(500).json({
      message: 'Failed to delete school admin',
      userMessage: 'Failed to delete school admin. Please try again.'
    });
  }
};

// --- Register School Admin (Tenant Creation with Plan Enforcement) ---
export const createSchoolAdmin = async (req, res) => {
  const { email, password, planId } = req.body;

  try {
    // Validate input
    if (!email || !password || !planId) {
      return res.status(400).json({
        message: 'Missing required fields',
        userMessage: 'Email, password, and a subscription plan are required.'
      });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        message: 'Email already registered',
        userMessage: 'This email is already registered.'
      });
    }

    // Load the Plan
    const Plan = (await import('../models/Plan.js')).default;
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        message: 'Plan not found',
        userMessage: 'The selected subscription plan does not exist.'
      });
    }

    // Create the User (School Admin) - NO school linked yet
    const tempName = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const admin = new User({
      name: tempName,
      email,
      password,
      role: 'schooladmin',
      schoolProfileCompleted: false,
      isEmailVerified: false,
      status: 'active',
      // Store intended plan in metadata for later use during onboarding
      metadata: { 
        intendedPlanId: planId 
      }
    });

    // Optionally generate a verification token and attempt to send a verification email.
    // IMPORTANT: failures to send email must not block account creation or roll back the user.
    try {
      const verificationToken = admin.generateEmailVerificationToken();
      await admin.save();
      try {
        await sendVerificationEmail(admin, verificationToken);
      } catch (emailError) {
        console.error('Non-blocking: failed to send verification email:', emailError.stack);
        // Clear token so user isn't left with a stale token when email couldn't be sent
        admin.emailVerificationToken = undefined;
        admin.emailVerificationTokenExpires = undefined;
        await admin.save();
      }
    } catch (err) {
      // If token generation or save fails, log but do not block creation
      console.error('Non-blocking: verification token generation failed:', err.stack);
      // Ensure admin is saved at least once
      if (!admin._id) await admin.save();
    }

    await logAction(req, {
      action: 'SCHOOL_ADMIN_CREATED',
      module: 'SUPER_ADMIN',
      targetId: admin._id,
      details: { email, planId }
    });

    res.status(201).json({
      success: true,
      message: 'School Admin created successfully.',
      userMessage: 'School Admin account created.',
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Create School Admin Error:', error.stack);
    res.status(500).json({
      message: 'Failed to create school admin',
      userMessage: 'Failed to create school admin. Please try again.'
    });
  }
};

// --- Safe Plan Upgrade ---
export const upgradeSchoolPlan = async (req, res) => {
  try {
    const { id } = req.params; // School ID
    const { newPlanId, reason } = req.body;

    if (!newPlanId) {
      return res.status(400).json({
        message: 'New plan ID is required',
        userMessage: 'Please select a new plan to upgrade to.'
      });
    }

    const school = await School.findById(id).populate('subscription.plan');
    if (!school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'School not found.'
      });
    }

    const Plan = (await import('../models/Plan.js')).default;
    const newPlan = await Plan.findById(newPlanId);
    if (!newPlan) {
      return res.status(404).json({
        message: 'Plan not found',
        userMessage: 'The selected plan does not exist.'
      });
    }

    const previousPlanName = school.subscription.plan ? school.subscription.plan.name : 'None';

    // Safely update ONLY the subscription configuration and limits
    school.subscription.plan = newPlan._id;
    
    // Sync features
    if (newPlan.features && newPlan.features.length > 0) {
      school.settings.enabledModules = [...newPlan.features];
    }

    school.subscription.limits = {
      students: newPlan.limits.students,
      teachers: newPlan.limits.teachers,
      branches: newPlan.limits.branches,
      admins: newPlan.limits.admins,
      storage: newPlan.limits.storage,
      sms: newPlan.limits.sms,
      email: newPlan.limits.email
    };
    // Extend end date by 1 year from now for upgrades (or based on business logic)
    const newEndDate = new Date();
    newEndDate.setFullYear(newEndDate.getFullYear() + 1);
    school.subscription.endDate = newEndDate;
    school.subscription.status = 'Active';

    await school.save();

    // Create Audit Log
    await logAction(req, {
      action: 'PLAN_UPGRADED',
      module: 'SaaS',
      details: {
        previousPlanName,
        newPlanName: newPlan.name,
        reason: reason || 'N/A',
        newLimits: newPlan.limits
      },
      targetId: school._id,
      oldValue: school.subscription.plan,
      newValue: newPlan._id
    });

    res.json({
      message: 'Plan upgraded safely',
      userMessage: `Successfully upgraded ${school.name} to the ${newPlan.name} plan. Existing data was preserved.`,
      school
    });
  } catch (error) {
    console.error('Upgrade Plan Error:', error);
    res.status(500).json({
      message: `Failed to upgrade plan: ${error.message}`,
      userMessage: 'Failed to upgrade the plan due to a server error.'
    });
  }
};

// --- Get all subscriptions (with approval status filter) ---
export const getSubscriptions = async (req, res) => {
  try {
    const { status, approval, search, page = 1, limit = 50 } = req.query;

    const query = {};

    if (approval && approval !== 'all') {
      query['subscription.approvalStatus'] = approval;
    }

    if (status && status !== 'all') {
      if (status === 'active') query.isActive = true;
      if (status === 'inactive') query.isActive = false;
      if (status === 'blocked') query['subscription.blockedByAdmin'] = true;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { subdomain: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await School.countDocuments(query);

    const schools = await School.find(query)
      .populate('subscription.plan', 'name code limits monthlyPrice yearlyPrice')
      .populate('subscription.approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean({ virtuals: true });

    // Add virtual fields
    const withVirtuals = schools.map(s => ({
      ...s,
      isSubscriptionExpired: s.subscription?.endDate ? new Date() > new Date(s.subscription.endDate) : false,
      daysUntilExpiry: s.subscription?.endDate
        ? Math.ceil((new Date(s.subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24))
        : null,
    }));

    res.json({
      message: 'Subscriptions retrieved',
      data: {
        subscriptions: withVirtuals,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (error) {
    console.error('Get Subscriptions Error:', error);
    res.status(500).json({
      message: `Failed to retrieve subscriptions: ${error.message}`,
      userMessage: 'Failed to load subscriptions.'
    });
  }
};

// --- Approve or Deny a school subscription ---
export const reviewSubscription = async (req, res) => {
  const { id } = req.params; // School ID
  const { action, note } = req.body; // action: 'approve' | 'deny'

  try {
    if (!['approve', 'deny'].includes(action)) {
      return res.status(400).json({
        message: 'Invalid action',
        userMessage: 'Action must be either "approve" or "deny".'
      });
    }

    const school = await School.findById(id);
    if (!school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'The specified school tenant was not found.'
      });
    }

    if (action === 'approve') {
      school.subscription.approvalStatus = 'approved';
      school.subscription.status = school.subscription.status === 'Trial' ? 'Active' : school.subscription.status;
      school.subscription.approvedAt = new Date();
      school.subscription.approvedBy = req.user._id;
      school.subscription.approvalNote = note || '';
      school.isActive = true;
    } else {
      school.subscription.approvalStatus = 'denied';
      school.subscription.approvalNote = note || 'Subscription denied by administrator.';
      school.subscription.approvedAt = new Date();
      school.subscription.approvedBy = req.user._id;
      // Optionally deactivate the school on denial
      school.subscription.blockedByAdmin = true;
      school.subscription.blockedReason = note || 'Subscription request denied.';
    }

    await school.save();

    const AuditLog = (await import('../models/AuditLog.js')).default;
    await AuditLog.create({
      school: school._id,
      user: req.user._id,
      action: action === 'approve' ? 'SUBSCRIPTION_APPROVED' : 'SUBSCRIPTION_DENIED',
      details: `Subscription ${action}d for ${school.name}. Note: ${note || 'N/A'}`,
      ipAddress: req.ip
    });

    res.json({
      message: `Subscription ${action}d`,
      userMessage: `Subscription for "${school.name}" has been ${action}d successfully.`,
      school
    });
  } catch (error) {
    console.error('Review Subscription Error:', error);
    res.status(500).json({
      message: `Failed to review subscription: ${error.message}`,
      userMessage: 'A server error occurred while processing the subscription review.'
    });
  }
};

