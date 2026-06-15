import mongoose from 'mongoose';
import User from '../models/User.js';
import ClassSubject from '../models/ClassSubject.js';
import School from '../models/School.js';
import Branch from '../models/Branch.js';
import { getEnabledFeaturesForSchool, isFeatureEnabled } from '../utils/featureAccess.js';
import {
  generateAccessToken,
  generateRefreshToken,
  setTokenCookies,
  clearRefreshCookie,
  verifyRefreshToken,
} from '../utils/tokenUtils.js';
import { escapeRegex } from '../utils/securityUtils.js';
import { logAction } from '../utils/auditLogger.js';
import { findUserSafely } from '../utils/safeUserQuery.js';
import { generateOTP, hashOTP, sendOTPEmail, verifyOTP as verifyOTPHash } from '../utils/twoFactorUtils.js';
import { sendVerificationEmail, sendTestEmail } from '../utils/emailService.js';
import crypto from 'crypto';

/**
 * Check if a school's plan includes a specific mobile app feature.
 * @param {Object} school - School object (must have subscription.plan populated)
 * @param {string} featureCode - Feature code to check (e.g., 'student-app', 'parent-app', 'teacher-app')
 * @returns {boolean}
 */
const hasMobileFeature = async (schoolId, featureCode) => {
  if (!schoolId) return true; // If no school context, allow (shouldn't happen)
  return isFeatureEnabled(schoolId, featureCode);
};

// Password validation helper
const issueTokens = async (res, user) => {
  const access = generateAccessToken(user);
  setTokenCookies(res, generateRefreshToken(user));
  return access;
};

// Account lockout helper
const checkLockout = (user) => {
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const remainingMin = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return { locked: true, remainingMin };
  }
  return { locked: false };
};

const handleFailedLogin = async (user) => {
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 5 * 60 * 1000; // 5 minutes
  user.loginAttempts = (user.loginAttempts || 0) + 1;
  if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    user.lockUntil = Date.now() + LOCK_TIME;
    user.loginAttempts = 0;
  }
  await user.save();
};

const handleSuccessfulLogin = async (req, user) => {
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLogin = Date.now();

  // Device Tracking
  const deviceId = req.headers['x-device-id'] || 'web-browser';
  const existingDevice = user.devices.find(d => d.deviceId === deviceId);
  
  if (existingDevice) {
    existingDevice.lastUsed = new Date();
    existingDevice.ip = ip;
  } else {
    user.devices.push({
      deviceId,
      deviceName: userAgent.slice(0, 50),
      lastUsed: new Date(),
      ip
    });
    // Keep only last 5 devices
    if (user.devices.length > 5) user.devices.shift();
  }

  await user.save();
};

// @desc    Auth student & get token
// @route   POST /api/auth/student-login
// @access  Public
export const studentLogin = async (req, res) => {
  const { customId, password, tenantId, branchId } = req.body;
  
  let selectedSchoolId = req.schoolId;
  if (tenantId) {
    const school = await School.findOne({ subdomain: tenantId.toLowerCase().trim(), isActive: true });
    if (school) selectedSchoolId = school._id;
  }
  
  if (!selectedSchoolId) {
    return res.status(400).json({
      message: 'Missing or Invalid Tenant ID',
      userMessage: 'School identification is missing or invalid.'
    });
  }

  try {
    const identifier = String(customId).trim();
    const isEmail = identifier.includes('@');
    
    const query = { role: 'student', school: selectedSchoolId };
    if (branchId) query.branch = branchId;

    if (isEmail) {
      query.email = identifier.toLowerCase();
    } else {
      query.customId = { $regex: new RegExp(`^${escapeRegex(identifier)}$`, 'i') };
    }

    const user = await findUserSafely(query, ['school', 'branch', 'class']);

    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid Student ID or password',
        userMessage: 'Invalid Student ID or password. Please check and try again.'
      });
    }

    // Check Lockout
    const lockout = checkLockout(user);
    if (lockout.locked) {
      return res.status(423).json({
        success: false,
        message: 'Account locked',
        userMessage: `Too many failed attempts. Please try again in ${lockout.remainingMin} minutes.`
      });
    }

    // Check if school/branch is active
    if (user.branch && user.branch.status !== 'active') {
      return res.status(403).json({
        message: 'Branch inactive',
        userMessage: `Your branch "${user.branch.name}" is currently inactive.`
      });
    }

    if (user.school && (!user.school.isActive || user.school.subscription?.blockedByAdmin)) {
      return res.status(403).json({
        message: 'School inactive',
        userMessage: `Your school is currently inactive or suspended.`
      });
    }

    // Check if student app is enabled in school's plan
    const studentAppEnabled = await hasMobileFeature(selectedSchoolId, 'student-app');
    if (!studentAppEnabled) {
      return res.status(403).json({
        message: 'Student App Not Available',
        userMessage: 'The Student App is not available for your school. Please contact your school administrator.'
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      await handleFailedLogin(user);
      return res.status(401).json({ 
        message: 'Invalid Student ID or password',
        userMessage: 'Invalid Student ID or password. Please check and try again.'
      });
    }

    await handleSuccessfulLogin(req, user);

    // Populate class subjects for student dashboard
    let classPayload = user.class;
    if (user.class) {
      const assignments = await ClassSubject.find({ class: user.class._id, school: selectedSchoolId })
        .populate('subject', 'name code')
        .populate('teacher', 'name customId');
      
      const classPlain = typeof user.class.toObject === 'function' ? user.class.toObject() : { ...user.class };
      classPayload = {
        ...classPlain,
        subjects: assignments.map((a) => ({
          _id: a.subject?._id,
          name: a.subject?.name,
          code: a.subject?.code,
          teacher: a.teacher,
        })),
      };
    }

    logAction(req, { action: 'STUDENT_LOGIN_SUCCESS', module: 'AUTH', targetId: user._id });

    res.json({
      _id:      user._id,
      name:     user.name,
      customId: user.customId,
      email:    user.email,
      role:     user.role,
      school:   user.school,
      branch:   user.branch,
      class:    classPayload,
      token:    await issueTokens(res, user),
    });

  } catch (error) {
    console.error(`Student login error: ${error.message}`);
    res.status(500).json({ 
      message: 'Something went wrong. Please try again later.',
      userMessage: 'Something went wrong. Please try again later.'
    });
  }
};

// @desc    Auth teacher & get token
// @route   POST /api/auth/teacher-login
// @access  Public
export const teacherLogin = async (req, res) => {
  const { customId, password, tenantId, branchId } = req.body;
  // Use tenant detected from header/host OR provided tenantId in body
  let selectedSchoolId = req.schoolId;
  
  // If tenantId provided in body (subdomain), find that school
  if (tenantId) {
    const school = await School.findOne({ subdomain: tenantId.toLowerCase().trim(), isActive: true });
    if (school) {
      selectedSchoolId = school._id;
    }
  }
  
  if (!selectedSchoolId) {
    return res.status(400).json({
      message: 'Missing or Invalid Tenant ID',
      userMessage: 'School identification is missing or invalid. Please ensure you enter the correct Tenant ID.'
    });
  }

  console.log(`Teacher login attempt: ID/Email=${customId}, SchoolID=${selectedSchoolId}, BranchID=${branchId || 'ANY'}`);
  try {
    const identifier = String(customId).trim();
    const isEmail = identifier.includes('@');
    
    const query = {
      role: 'teacher',
      school: selectedSchoolId
    };

    if (branchId) {
      query.branch = branchId;
    }

    if (isEmail) {
      query.email = identifier.toLowerCase();
    } else {
      const safeId = escapeRegex(identifier);
      query.customId = { $regex: new RegExp(`^${safeId}$`, 'i') };
    }

    const user = await findUserSafely(query, ['school', 'branch']);

    if (!user) {
      console.log(`Teacher not found: ${isEmail ? 'Email' : 'ID'}=${identifier}, SchoolID=${selectedSchoolId}`);
      return res.status(401).json({ 
        message: 'Invalid Teacher ID or password',
        userMessage: 'Invalid Teacher ID or password. Please check and try again.'
      });
    }

    // Validate Branch
    if (user.branch && user.branch.status !== 'active') {
      return res.status(403).json({
        message: 'Branch inactive',
        userMessage: `Your assigned branch "${user.branch.name}" is currently inactive. Please contact your school administrator.`
      });
    }

    // Check if school is blocked
    if (user.school) {
      const school = user.school;
      if (school.subscription?.blockedByAdmin) {
        const blockReason = school.subscription.blockedReason || 'Blocked by administrator';
        return res.status(403).json({
          message: 'School blocked by administrator',
          userMessage: `Your school "${school.name}" has been temporarily suspended by the super admin.\n\nReason: ${blockReason}\n\nPlease contact the super admin to discuss when your school can be reactivated.`
        });
      }
      
      if (!school.isActive) {
        return res.status(403).json({
          message: 'School inactive',
          userMessage: `Your school "${school.name}" is currently inactive. Please contact the super admin to activate your school before you can log in.`
        });
      }
      
      if (school.subscription?.endDate) {
        const now = new Date();
        const endDate = new Date(school.subscription.endDate);
        if (now > endDate) {
          return res.status(403).json({
            message: 'School subscription expired',
            userMessage: `Your school subscription has expired on ${endDate.toLocaleDateString()}. Please contact the super admin to renew your subscription.`
          });
        }
      }
    }

    // Check if teacher app is enabled in school's plan
    const teacherAppEnabled = await hasMobileFeature(selectedSchoolId, 'teacher-app');
    if (!teacherAppEnabled) {
      return res.status(403).json({
        message: 'Teacher App Not Available',
        userMessage: 'The Teacher App is not available for your school. Please contact your school administrator.'
      });
    }

    const lockoutStatus = checkLockout(user);
    if (lockoutStatus.locked) {
      return res.status(403).json({
        message: 'Account locked',
        userMessage: `Too many failed login attempts. Your account is locked for another ${lockoutStatus.remainingMin} minutes.`
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      await handleFailedLogin(user);
      console.log(`Teacher password mismatch: ${customId}`);
      return res.status(401).json({ 
        message: 'Invalid Teacher ID or password',
        userMessage: 'Invalid Teacher ID or password. Please check and try again.'
      });
    }

    await handleSuccessfulLogin(req, user);
    if (true) {
      // Proactively ensure teacher has a customId if missing
      if (user.role === 'teacher' && !user.customId) {
        const count = await User.countDocuments({ role: 'teacher', school: user.school?._id || user.school || selectedSchoolId });
        user.customId = `T-${(count + 1).toString().padStart(4, '0')}`;
        await user.save();
      }

      const rows = await ClassSubject.find({ teacher: user._id, school: user.school?._id || user.school || selectedSchoolId })
        .populate('subject', 'name code')
        .populate('class', 'name section');
      const subjects = rows
        .filter((r) => r.subject)
        .map((r) => ({
          _id: r.subject._id,
          name: r.subject.name,
          code: r.subject.code,
          class: r.class,
        }));

      console.log(`Teacher login successful: ${customId}`);
      res.json({
        _id:      user._id,
        name:     user.name,
        customId: user.customId,
        email:    user.email,
        role:     user.role,
        school:   user.school,
        branch:   user.branch,
        subjects, // array of subjects the teacher handles
        token:    await issueTokens(res, user),
      });
    }
  } catch (error) {
    console.error(`Teacher login error: ${error.message}`);
    res.status(500).json({ 
      message: 'Something went wrong. Please try again later.',
      userMessage: 'Something went wrong. Please try again later.'
    });
  }
};

// @desc    Auth parent & get token (mobile app)
// @route   POST /api/auth/parent-login
// @access  Public
export const parentLogin = async (req, res) => {
  const { customId, phone, email, password, tenantId, branchId } = req.body;
  let selectedSchoolId = req.schoolId;

  if (tenantId) {
    const school = await School.findOne({ subdomain: tenantId.toLowerCase().trim(), isActive: true });
    if (school) selectedSchoolId = school._id;
  }

  if (!selectedSchoolId) {
    return res.status(400).json({
      message: 'Missing or Invalid Tenant ID',
      userMessage: 'School identification is missing or invalid.',
    });
  }

  try {
    const identifier = String(email || phone || customId || '').trim();
    const isEmail = identifier.includes('@');
    const query = { role: 'parent', school: selectedSchoolId };
    if (branchId) query.branch = branchId;

    if (email || isEmail) {
      query.email = identifier.toLowerCase();
    } else if (phone) {
      query.phone = identifier;
    } else {
      query.customId = { $regex: new RegExp(`^${escapeRegex(identifier)}$`, 'i') };
    }

    console.log('[ParentLogin]', {
      tenantId: tenantId || req.tenantId || null,
      branchId: branchId || null,
      path: req.originalUrl,
      controller: 'authController.parentLogin',
      query: { role: query.role, school: String(query.school), branch: query.branch || null, by: email || isEmail ? 'email' : phone ? 'phone' : 'customId' },
    });

    const user = await findUserSafely(query, ['school', 'branch', 'linkedStudents']);

    if (!user) {
      return res.status(401).json({
        message: 'Invalid parent credentials',
        userMessage: 'Invalid email/ID or password.',
      });
    }

    if (!user.password) {
      return res.status(403).json({
        message: 'Credentials not yet generated',
        userMessage: 'Your parent account is not ready yet. Contact the school administrator.',
      });
    }

    if (user.branch && user.branch.status !== 'active') {
      return res.status(403).json({
        message: 'Branch inactive',
        userMessage: `Your assigned branch "${user.branch.name}" is currently inactive.`,
      });
    }

    if (user.school && (!user.school.isActive || user.school.subscription?.blockedByAdmin)) {
      return res.status(403).json({
        message: 'School inactive',
        userMessage: 'Your school is currently inactive or suspended.',
      });
    }

    const lockoutStatus = checkLockout(user);
    if (lockoutStatus.locked) {
      return res.status(403).json({
        message: 'Account locked',
        userMessage: `Too many failed login attempts. Your account is locked for another ${lockoutStatus.remainingMin} minutes.`
      });
    }

    // Check if parent app is enabled in school's plan
    const parentAppEnabled = await hasMobileFeature(selectedSchoolId, 'parent-app');
    if (!parentAppEnabled) {
      return res.status(403).json({
        message: 'Parent App Not Available',
        userMessage: 'The Parent App is not available for your school. Please contact your school administrator.'
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      await handleFailedLogin(user);
      return res.status(401).json({
        message: 'Invalid parent credentials',
        userMessage: 'Invalid email/ID or password.',
      });
    }

    await handleSuccessfulLogin(req, user);

    logAction(req, { action: 'PARENT_LOGIN_SUCCESS', module: 'AUTH', targetId: user._id });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      customId: user.customId,
      role: user.role,
      school: user.school,
      branch: user.branch,
      linkedStudents: user.linkedStudents || [],
      token: await issueTokens(res, user),
    });
  } catch (error) {
    console.error(`Parent login error: ${error.message}`);
    res.status(500).json({
      message: 'Something went wrong. Please try again later.',
      userMessage: 'Something went wrong. Please try again later.',
    });
  }
};

// @desc    Auth admin & get token
// @route   POST /api/auth/admin-login
// @access  Public
export const adminLogin = async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // If on admin subdomain, allow superadmin login
    if (req.isSuperAdminRoute) {
      const normalizedEmail = (email || '').trim().toLowerCase();
      const user = await User.findOne({
        email: normalizedEmail,
        role: 'superadmin',
      });
      const lockoutStatus = checkLockout(user);
      if (lockoutStatus.locked) {
        return res.status(403).json({
          message: 'Account locked',
          userMessage: `Too many failed login attempts. Your account is locked for another ${lockoutStatus.remainingMin} minutes.`
        });
      }

      if (user && (await user.matchPassword(password))) {
        await handleSuccessfulLogin(req, user);

        // --- 2FA for Super Admin ---
        const otp = generateOTP();
        user.otp = await hashOTP(otp);
        user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        user.otpAttempts = 0;
        await user.save();

        try {
          await sendOTPEmail(user.email, otp, user);
        } catch (emailError) {
          console.error('Failed to send OTP email:', emailError.message);
          return res.status(500).json({
            message: 'Failed to send verification code',
            userMessage: 'We could not send the verification code to your email. Please try again later.',
            error: emailError.message
          });
        }

        return res.json({
          requires2FA: true,
          userId: user._id,
          email: user.email.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => gp2 + '*'.repeat(gp3.length)),
          message: 'A verification code has been sent to your email.'
        });
      }
    }

    // Otherwise, it's a regular school admin login scoped to the detected school
    const selectedSchoolId = req.schoolId;
    if (!selectedSchoolId) {
      return res.status(401).json({
        message: 'School not detected',
        userMessage: 'Please access the system through your school\'s subdomain.'
      });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    const user = await User.findOne({
      email: normalizedEmail,
      role: { $in: ['admin', 'schooladmin', 'branchmanager', 'branch_manager'] },
      school: selectedSchoolId
    }).populate('school').populate('branch');

    if (user && (await user.matchPassword(password))) {
      // Validate branch if user is a branch manager
      if ((user.role === 'branchmanager' || user.role === 'branch_manager') && !user.branch) {
        return res.status(403).json({
          message: 'Branch not assigned',
          userMessage: 'Your account is not assigned to any branch. Please contact your school administrator.'
        });
      }

      if (user.branch && user.branch.status !== 'active') {
        return res.status(403).json({
          message: 'Branch inactive',
          userMessage: `Your assigned branch "${user.branch.name}" is currently inactive. Please contact your school administrator.`
        });
      }

      await handleSuccessfulLogin(req, user);

      // --- 2FA for School Admin / Branch Manager ---
      const otp = generateOTP();
      user.otp = await hashOTP(otp);
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      user.otpAttempts = 0;
      await user.save();

      try {
        await sendOTPEmail(user.email, otp, user);
      } catch (emailError) {
        console.error('Failed to send OTP email:', emailError.message);
        return res.status(500).json({
          message: 'Failed to send verification code',
          userMessage: 'We could not send the verification code to your email. Please try again later.',
          error: emailError.message
        });
      }

      // Log login attempt (pending 2FA)
      await logAction(req, {
        action: 'LOGIN_PENDING_2FA',
        module: 'AUTH',
        details: { email: user.email, role: user.role }
      });

      res.json({
        requires2FA: true,
        userId: user._id,
        email: user.email.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => gp2 + '*'.repeat(gp3.length)),
        message: 'A verification code has been sent to your email.'
      });
    } else {
      res.status(401).json({ 
        message: 'Invalid Admin email or password',
        userMessage: 'Invalid email or password. Please check and try again.'
      });
    }
  } catch (error) {
    res.status(500).json({ 
      message: 'Something went wrong. Please try again later.',
      userMessage: 'Something went wrong. Please try again later.'
    });
  }
};

// @desc    Auth branch & get token
// @route   POST /api/auth/branch-login
// @access  Public
export const branchLogin = async (req, res) => {
  const { email, password, tenantId } = req.body;
  
  try {
    let selectedSchoolId = req.schoolId;
    
    // If tenantId provided in body (subdomain), find that school
    if (tenantId) {
      const school = await School.findOne({ subdomain: tenantId.toLowerCase().trim(), isActive: true });
      if (school) {
        selectedSchoolId = school._id;
      }
    }
    
    if (!selectedSchoolId) {
      return res.status(400).json({
        message: 'Missing or Invalid Tenant ID',
        userMessage: 'School identification is missing or invalid. Please ensure you enter the correct Tenant ID.'
      });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    
    // Find the branch directly by its login email
    const branch = await Branch.findOne({
      loginEmail: normalizedEmail,
      tenant: selectedSchoolId,
      isDeleted: false
    }).populate('tenant').populate('rbacRole');

    if (!branch) {
      return res.status(401).json({ 
        message: 'Invalid branch credentials',
        userMessage: 'Invalid email or password for this branch.'
      });
    }

    // Validate Branch Status
    if (branch.status !== 'active') {
      return res.status(403).json({
        message: 'Branch inactive',
        userMessage: `The branch "${branch.name}" is currently ${branch.status}. Please contact your school administrator.`
      });
    }

    // Validate Tenant Status
    const tenant = branch.tenant;
    if (!tenant || !tenant.isActive) {
      return res.status(403).json({
        message: 'School inactive',
        userMessage: 'The school associated with this branch is currently inactive.'
      });
    }

    // Check password
    const isMatch = await branch.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        message: 'Invalid branch credentials',
        userMessage: 'Invalid email or password for this branch.'
      });
    }

    // --- 2FA for Branch ---
    const otp = generateOTP();
    branch.otp = await hashOTP(otp);
    branch.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    branch.otpAttempts = 0;
    await branch.save();

    try {
      await sendOTPEmail(branch.loginEmail, otp, { name: branch.name });
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError.message);
      return res.status(500).json({ 
        message: 'Failed to send verification code',
        userMessage: 'We could not send the verification code to your email. Please try again later.',
        error: emailError.message
      });
    }

    await logAction(req, {
      action: 'BRANCH_LOGIN_PENDING_2FA',
      module: 'AUTH',
      tenantId: branch.tenant._id,
      branchId: branch._id,
      details: { email: branch.loginEmail, name: branch.name }
    });

    return res.json({
      requires2FA: true,
      userId: branch._id,
      isBranchLogin: true, // Flag for frontend
      email: branch.loginEmail.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => gp2 + '*'.repeat(gp3.length)),
      message: 'A verification code has been sent to your branch email.'
    });
  } catch (error) {
    console.error(`Branch login error: ${error.message}`);
    res.status(500).json({ 
      message: 'Something went wrong. Please try again later.',
      userMessage: 'Something went wrong. Please try again later.'
    });
  }
};

/**
 * @desc    Get current tenant information
 * @route   GET /api/auth/tenant
 * @access  Public
 */
export const getTenantInfo = async (req, res) => {
  // 1. Check for Super Admin route/context (detected by RESERVED subdomains)
  if (req.isSuperAdminRoute) {
    return res.json({ 
      type: 'superadmin',
      name: 'Super Admin Dashboard' 
    });
  }

  // 2. If no school is detected on req, we are on the Platform Root (e.g. localhost or root host)
  if (!req.school) {
    // We allow access to the platform home/login even if no tenant is found
    // This enables the "Shared Login" experience.
    return res.json({
      type: 'dev', // 'dev' type triggers platform public routes in frontend
      name: 'EduManage Platform'
    });
  }

  // 3. Specific School Tenant
  const enabledFeatures = await getEnabledFeaturesForSchool(req.school._id);
  res.json({
    type: 'school',
    _id: req.school._id,
    name: req.school.name,
    logo: req.school.logo,
    subdomain: req.school.subdomain,
    isActive: req.school.isActive,
    subscriptionStatus: req.school.subscription?.paymentStatus,
    enabledFeatures: enabledFeatures
  });
};

// @desc    Auth user & get token (school-scoped; never trusts body tenant)
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  const { email, customId, password } = req.body;

  try {
    let activeSchoolId = req.schoolId;
    let user;

    // Search query construction
    const buildQuery = (schoolId = null) => {
      const q = email 
        ? { email: email.trim().toLowerCase() } 
        : { customId: { $regex: new RegExp(`^${escapeRegex(String(customId))}$`, 'i') } };
      
      if (schoolId) q.school = schoolId;
      return q;
    };

    // Support for shared domain login (Super Admin host)
    // If no activeSchoolId is detected from domain, find the user across all tenants
    if (req.isSuperAdminRoute || !activeSchoolId) {
      if (!email && !customId) {
        return res.status(400).json({
          message: 'Email or ID required',
          userMessage: 'Please enter your email or your school ID to continue.',
        });
      }

      user = await findUserSafely(buildQuery(), ['school', 'rbacRole']);

      // --- 1. DIRECT BRANCH LOGIN SUPPORT ---
      if (!user && email) {
        const branch = await Branch.findOne({ loginEmail: email.trim().toLowerCase(), status: 'active' }).populate('tenant');
        if (branch && branch.password && (await branch.matchPassword(password))) {
          // Load branch's role if assigned
          let branchPermissions = [
            'students.view', 'students.create', 'students.edit', 
            'teachers.view', 
            'classes.view', 
            'subjects.view', 
            'attendance.view', 'attendance.create', 
            'exams.view', 'exams.create', 
            'finance.view',
            'schedules.view',
            'settings.view'
          ]; // Default branch perms
          
          // If branch has an assigned role, load its permissions
          if (branch.rbacRole) {
            try {
              const Role = (await import('../models/Role.js')).default;
              const role = await Role.findById(branch.rbacRole);
              if (role && role.permissions) {
                branchPermissions = role.permissions;
              }
            } catch (error) {
              console.error('Error loading branch role permissions:', error);
            }
          }
          
          // Virtual user for branch session
          const branchUser = {
            _id: branch._id,
            name: branch.name,
            email: branch.loginEmail,
            role: 'branch_manager',
            branch: branch._id,
            school: branch.tenant,
            branchScope: 'SPECIFIC',
            rbacRole: branch.rbacRole,
            permissions: branchPermissions
          };

          logAction(req, { action: 'BRANCH_LOGIN_SUCCESS', module: 'AUTH', targetId: branch._id });

          return res.json({
            ...branchUser,
            school: branch.tenant,
            token: await issueTokens(res, branchUser),
          });
        }
      }

      if (!user) {
        logAction(req, { action: 'LOGIN_FAILURE', module: 'AUTH', details: { email, customId, reason: 'User not found' } });
        return res.status(401).json({
          message: 'Invalid credentials',
          userMessage: 'Invalid email or password.',
        });
      }

      // If it's a super admin, they don't necessarily need a school context
      if (user.role === 'superadmin' || user.role === 'super_admin' || user.isSuperAdmin) {
        if (await user.matchPassword(password)) {
          return res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: 'superadmin',
            isSuperAdmin: true,
            token: await issueTokens(res, user),
          });
        }
      }

      // If it's a school user, they MUST have a school associated
      const isNewAdmin = ['schooladmin', 'school_admin', 'admin'].includes(user.role) && !user.school;
      
      if (!user.school && !isNewAdmin) {
        return res.status(403).json({
          message: 'No school associated',
          userMessage: 'Your account is not associated with any school. Please contact support.',
        });
      }

      activeSchoolId = user.school ? user.school._id : null;
    } else {
      user = await findUserSafely(buildQuery(activeSchoolId), ['school']);
    }

    if (!user) {
      return res.status(401).json({
        message: 'Invalid credentials',
        userMessage: 'Invalid login credentials. Please check and try again.',
      });
    }

    // --- Brute Force Protection & Account Lockout ---
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCK_TIME = 5 * 60 * 1000; // 5 minutes

    if (user.lockUntil && user.lockUntil > Date.now()) {
      const remainingMin = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(403).json({
        message: 'Account locked',
        userMessage: `Too many failed login attempts. Your account is locked for another ${remainingMin} minutes.`
      });
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = Date.now() + LOCK_TIME;
        user.loginAttempts = 0; // Reset for after lockout
      }
      await user.save();
      
      logAction(req, { action: 'LOGIN_FAILURE', module: 'AUTH', details: { email, customId, reason: 'Invalid password' } });

      return res.status(401).json({
        message: 'Invalid credentials',
        userMessage: 'Invalid login credentials. Please check and try again.',
      });
    }

    // Reset login attempts on success
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = Date.now();
    await user.save();

    // --- 1. Email Verification Check ---
    if (['schooladmin', 'school_admin', 'admin'].includes(user.role) && user.isEmailVerified === false) {
      return res.status(403).json({
        requiresVerification: true,
        email: user.email,
        message: 'Email not verified',
        userMessage: 'Please verify your email address to continue.'
      });
    }

    // --- 2. Two-Factor Authentication (2FA) ---
    const rolesRequiring2FA = ['superadmin', 'super_admin', 'schooladmin', 'school_admin', 'admin', 'branchmanager', 'branch_manager'];
    
    if (rolesRequiring2FA.includes(user.role)) {
      const otp = generateOTP();
      user.otp = await hashOTP(otp);
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      user.otpAttempts = 0;
      await user.save();

      try {
        await sendOTPEmail(user.email, otp, user);
      } catch (emailError) {
        console.error('Failed to send OTP email:', emailError.message);
        return res.status(500).json({
          message: 'Failed to send verification code',
          userMessage: 'We could not send the verification code to your email. Please try again later.',
          error: emailError.message
        });
      }

      logAction(req, { action: '2FA_OTP_SENT', module: 'AUTH', targetId: user._id, details: { email: user.email } });

      return res.json({
        requires2FA: true,
        userId: user._id,
        email: user.email.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => gp2 + '*'.repeat(gp3.length)), // Mask email
        message: 'A verification code has been sent to your email.'
      });
    }

    logAction(req, { action: 'LOGIN_SUCCESS', module: 'AUTH', targetId: user._id });

    // Final safety check for tenant mismatch if we are on a subdomain
    if (req.schoolId && user.school && user.school._id.toString() !== req.schoolId.toString()) {
      console.warn(`Login 403: Tenant mismatch for user ${user.email}. RequestSchoolId=${req.schoolId}, UserSchoolId=${user.school._id}`);
      return res.status(403).json({
        message: 'Tenant mismatch',
        userMessage: 'You are not authorized to log in for this school.',
      });
    }

    // Handle inactive/blocked school (if school exists)
    if (user.school) {
      const school = user.school;
      if (school.subscription?.blockedByAdmin) {
        console.warn(`Login 403: School blocked for user ${user.email}. School=${school.name}`);
        return res.status(403).json({
          message: 'School blocked',
          userMessage: `Your school "${school.name}" has been suspended.`,
        });
      }
      if (!school.isActive) {
        console.warn(`Login 403: School inactive for user ${user.email}. School=${school.name}`);
        return res.status(403).json({
          message: 'School inactive',
          userMessage: `Your school "${school.name}" is currently inactive.`,
        });
      }
    }

    if (!user.customId && (user.role === 'teacher' || user.role === 'student')) {
      const prefix = user.role === 'teacher' ? 'T' : 'S';
      const count = await User.countDocuments({
        role: user.role,
        school: user.school?._id || user.school,
      });
      user.customId = `${prefix}-${(count + 1).toString().padStart(4, '0')}`;
      await user.save();
    }

    // Add enabled features to the school object if school exists
    let schoolData = user.school;
    if (user.school && (user.school._id || user.school)) {
      const schoolId = user.school._id || user.school;
      const enabledFeatures = await getEnabledFeaturesForSchool(schoolId);
      // If school is a populated object, add enabledFeatures to it
      if (typeof schoolData === 'object' && schoolData !== null) {
        schoolData = { ...schoolData.toObject ? schoolData.toObject() : schoolData, enabledFeatures };
      }
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      customId: user.customId,
      role: user.role,
      branchScope: user.branchScope || 'SPECIFIC',
      permissions: user.permissions || [],
      school: schoolData,
      schoolProfileCompleted: user.schoolProfileCompleted,
      token: await issueTokens(res, user),
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({
      message: 'Something went wrong',
      userMessage: 'Something went wrong. Please try again later.',
    });
  }
};

// @desc    Register a new user (Admin only creates others)
// @route   POST /api/auth/register
// @access  Private/Admin
export const register = async (req, res) => {
  const { name, email, customId, password, role } = req.body;

  try {
    if (!req.schoolId) {
      return res.status(403).json({
        message: 'School context required',
        userMessage: 'You must be on a school subdomain to create users.',
      });
    }

    const normalizedRole =
      role === 'school_admin' ? 'schooladmin' : role;

    const forbidden = ['superadmin', 'super_admin'];
    if (forbidden.includes(normalizedRole) || forbidden.includes(role)) {
      return res.status(403).json({
        message: 'Invalid role',
        userMessage: 'This role cannot be created from this endpoint.',
      });
    }

    const orClause = [];
    if (email) orClause.push({ email: email.trim().toLowerCase() });
    if (customId) orClause.push({ customId });

    const userExists = orClause.length
      ? await User.findOne({
          school: req.schoolId,
          $or: orClause,
        })
      : null;

    if (userExists) {
      return res.status(400).json({
        message: 'User already exists with this email or ID',
        userMessage: 'A user with this email or ID already exists in this school.',
      });
    }

    const user = await User.create({
      name,
      email: email ? email.trim().toLowerCase() : undefined,
      customId,
      password,
      role: normalizedRole,
      school: req.schoolId,
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        school: user.school,
      });
    } else {
      res.status(400).json({
        message: 'Invalid user data',
        userMessage: 'Please check your information and try again.',
      });
    }
  } catch (error) {
    res.status(500).json({
      message: 'Something went wrong. Please try again later.',
      userMessage: 'Something went wrong. Please try again later.',
    });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
export const getProfile = async (req, res) => {
  try {
    // req.user is already populated by authMiddleware
    let user = req.user;

    if (!user) return res.status(404).json({ 
      message: 'User not found',
      userMessage: 'User not found.'
    });

    // If for some reason school is not fully populated, re-fetch
    if (!user.school || typeof user.school === 'string' || user.school instanceof mongoose.Types.ObjectId) {
      user = await User.findById(user._id)
        .populate('school')
        .populate('class');
    }

    // Ensure teacher has a customId if missing
    if (user.role === 'teacher' && !user.customId) {
      const schoolId = user.school?._id || user.school || req.schoolId;
      if (schoolId) {
        const count = await User.countDocuments({ role: 'teacher', school: schoolId });
        user.customId = `T-${(count + 1).toString().padStart(4, '0')}`;
        await user.save();
        console.log(`Generated Teacher ID for ${user.name}: ${user.customId} in school ${schoolId}`);
      }
    }

    // Add enabled features to the school object
    let schoolData = user.school;
    if (user.school && (user.school._id || user.school)) {
      const schoolId = user.school._id || user.school;
      const enabledFeatures = await getEnabledFeaturesForSchool(schoolId);
      if (typeof schoolData === 'object' && schoolData !== null) {
        schoolData = { ...schoolData.toObject ? schoolData.toObject() : schoolData, enabledFeatures };
      }
    }

    const base = {
      _id:      user._id,
      name:     user.name,
      email:    user.email,
      customId: user.customId, // This is crucial for the frontend!
      role:     user.role,
      school:   schoolData,
      phone:    user.phone || 'N/A',
      profileImage: user.profileImage,
      age:      user.age || user.teacherAge || 'N/A',
      status:   user.status,
      preferences: user.metadata?.preferences || {},
    };

    if (user.role === 'student') {
      let classPayload = user.class;
      // If student has a class but it's not populated, re-fetch
      if (user.class && (typeof user.class === 'string' || user.class instanceof mongoose.Types.ObjectId)) {
        const fullUser = await User.findById(user._id).populate('class');
        classPayload = fullUser.class;
      }

      if (classPayload) {
        const schoolId = user.school?._id || user.school;
        const assignments = await ClassSubject.find({ class: classPayload._id, school: schoolId })
          .populate('subject', 'name code')
          .populate('teacher', 'name customId');
        
        const classPlain = typeof classPayload.toObject === 'function' ? classPayload.toObject() : { ...classPayload };
        classPayload = {
          ...classPlain,
          subjects: assignments.map((a) => ({
            _id: a.subject?._id,
            name: a.subject?.name,
            code: a.subject?.code,
            teacher: a.teacher,
          })),
        };
      }
      return res.json({ 
        ...base, 
        class: classPayload,
        monthlyFees: user.monthlyFees,
        parentName: user.parentName,
        parentPhone: user.parentPhone,
      });
    }

    if (user.role === 'teacher') {
      const schoolId = user.school?._id || user.school;
      const rows = await ClassSubject.find({ teacher: user._id, school: schoolId })
        .populate('subject', 'name code')
        .populate('class', 'name section');
      const subjects = rows
        .filter((r) => r.subject)
        .map((r) => ({
          _id: r.subject._id,
          name: r.subject.name,
          code: r.subject.code,
          class: r.class,
        }));
      return res.json({ 
        ...base, 
        subjects,
        workingStartTime: user.workingStartTime,
        workingEndTime: user.workingEndTime,
        teacherAge: user.teacherAge,
        qualification: user.qualification,
        specialization: user.specialization,
        joiningDate: user.joiningDate,
      });
    }

    res.json(base);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ 
      message: 'Something went wrong. Please try again later.',
      userMessage: 'Something went wrong. Please try again later.'
    });
  }
};

// @desc    Update authenticated user's UI preferences
// @route   PUT /api/auth/preferences
// @access  Private
export const updatePreferences = async (req, res) => {
  try {
    const allowedLanguages = new Set(['en', 'so', 'ar']);
    const nextPreferences = {};

    if (req.body.language !== undefined) {
      if (!allowedLanguages.has(req.body.language)) {
        return res.status(400).json({
          success: false,
          message: 'Unsupported language',
          userMessage: 'Please choose a supported language.',
        });
      }
      nextPreferences.language = req.body.language;
    }

    if (Object.keys(nextPreferences).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No preferences provided',
        userMessage: 'No preferences were provided.',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        userMessage: 'User not found.',
      });
    }

    user.metadata = {
      ...(user.metadata || {}),
      preferences: {
        ...(user.metadata?.preferences || {}),
        ...nextPreferences,
      },
    };
    await user.save();

    res.json({
      success: true,
      preferences: user.metadata.preferences,
    });
  } catch (error) {
    console.error('Preference update error:', error);
    res.status(500).json({
      success: false,
      message: 'Could not update preferences',
      userMessage: 'Could not update preferences. Please try again.',
    });
  }
};

// @desc    Reset password (Self or Admin)
// @route   PUT /api/auth/reset-password
// @access  Private (Self) or Private/Admin (For others)
export const resetPassword = async (req, res, next) => {
  const { userId, newPassword } = req.body;

  try {
    if (!newPassword) {
      return res.status(400).json({
        message: 'Password required',
        userMessage: 'Please enter a new password.',
      });
    }

    const isElevated =
      req.user.role === 'admin' ||
      req.user.role === 'schooladmin' ||
      req.user.role === 'school_admin';

    if (userId && !isElevated) {
      return res.status(403).json({
        message: 'Not authorized to reset others passwords',
        userMessage: "You do not have permission to reset other users' passwords.",
      });
    }

    const targetId = userId || req.user._id;
    const user = await User.findById(targetId);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        userMessage: 'User not found.',
      });
    }

    const isSuper =
      req.user.role === 'superadmin' || req.user.role === 'super_admin';

    if (!isSuper) {
      const userSchoolId = user.school?._id || user.school;
      const currentSchoolId = req.schoolId;

      // In local development, we might not have a host-based tenant. 
      // If the user has a school and we are in a hostless context, we verify 
      // they aren't trying to reset someone else's password in a cross-tenant way.
      if (currentSchoolId && userSchoolId) {
        if (userSchoolId.toString() !== currentSchoolId.toString()) {
          return res.status(403).json({
            message: 'Cross-tenant password reset forbidden',
            userMessage: 'You cannot reset passwords for users in another school.',
          });
        }
      } else if (!isElevated && String(user._id) !== String(req.user._id)) {
        // If no school context but user is trying to reset someone else (and not admin)
        return res.status(403).json({
          message: 'Authorization required',
          userMessage: 'You are not authorized to reset this password.',
        });
      }
    }

    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    res.json({
      message: 'Password reset successfully',
      userMessage: 'Password changed successfully.',
    });
  } catch (error) {
    next(error); // Pass to global error handler for better logging and 500 formatting
  }
};

// @desc    Rotate access token using httpOnly refresh cookie
// @route   POST /api/auth/refresh
// @access  Public (cookie-bound)
export const refreshAccessToken = async (req, res) => {
  try {
    const refresh =
      req.cookies?.refreshToken ||
      (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null);

    if (!refresh) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token',
        userMessage: 'Please login again.',
      });
    }

    const decoded = verifyRefreshToken(refresh);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
        userMessage: 'Please login again.',
      });
    }

    const user = await User.findById(decoded.id).populate('school', 'name subdomain isActive');

    if (!user || ['inactive', 'suspended'].includes(user.status)) {
      clearRefreshCookie(res);
      return res.status(401).json({
        success: false,
        message: 'User invalid',
        userMessage: 'Please login again.',
      });
    }

    if ((user.tokenVersion ?? 0) !== (decoded.tv ?? 0)) {
      clearRefreshCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Refresh token revoked',
        userMessage: 'Please login again.',
      });
    }

    const access = generateAccessToken(user);
    setTokenCookies(res, generateRefreshToken(user));

    return res.json({
      success: true,
      token: access,
      role: user.role,
    });
  } catch (error) {
    clearRefreshCookie(res);
    return res.status(401).json({
      success: false,
      message: 'Refresh failed',
      userMessage: 'Please login again.',
    });
  }
};

// @desc    Logout — invalidate refresh chain
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { tokenVersion: 1 },
    });
    clearRefreshCookie(res);
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    clearRefreshCookie(res);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      userMessage: 'Could not complete logout.',
    });
  }
};

// @desc    Verify 2FA OTP
// @route   POST /api/auth/verify-2fa
// @access  Public
export const verify2FA = async (req, res) => {
  const { userId, otp, isBranchLogin } = req.body;

  try {
    if (!userId || !otp) {
      return res.status(400).json({
        message: 'Missing required fields',
        userMessage: 'User ID and verification code are required.'
      });
    }

    let user;
    if (isBranchLogin) {
      user = await Branch.findById(userId).populate('tenant').populate('rbacRole');
    } else {
      user = await User.findById(userId).populate('school').populate('branch');
    }

    if (!user) {
      return res.status(404).json({
        message: 'Account not found',
        userMessage: 'Account not found.'
      });
    }

    // Check if OTP exists and is not expired
    if (!user.otp || !user.otpExpires || user.otpExpires < Date.now()) {
      return res.status(401).json({
        message: 'Verification code expired',
        userMessage: 'Your verification code has expired. Please request a new one.'
      });
    }

    // Check OTP attempts (Brute force protection)
    const MAX_OTP_ATTEMPTS = 3;
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      user.otp = undefined;
      user.otpExpires = undefined;
      user.otpAttempts = 0;
      await user.save();
      
      return res.status(403).json({
        message: 'Too many attempts',
        userMessage: 'Too many incorrect attempts. Please log in again to receive a new code.'
      });
    }

    // Verify OTP
    const isMatch = await verifyOTPHash(otp, user.otp);

    if (!isMatch) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();
      
      return res.status(401).json({
        message: 'Invalid verification code',
        userMessage: `Invalid verification code. You have ${MAX_OTP_ATTEMPTS - user.otpAttempts} attempts remaining.`
      });
    }

    // OTP is valid!
    user.otp = undefined;
    user.otpExpires = undefined;
    user.otpAttempts = 0;
    await user.save();

    logAction(req, { action: '2FA_VERIFIED', module: 'AUTH', targetId: user._id });

    if (isBranchLogin) {
      // Resolve permissions from role
      let permissions = [
        'students.view', 'students.create', 'students.edit', 
        'teachers.view', 
        'classes.view', 
        'subjects.view', 
        'attendance.view', 'attendance.create', 
        'exams.view', 'exams.create', 
        'finance.view',
        'schedules.view',
        'settings.view'
      ];
      
      if (user.rbacRole && user.rbacRole.permissions) {
        permissions = user.rbacRole.permissions;
      }

      const branchUser = {
        _id: user._id,
        name: user.name,
        email: user.loginEmail,
        role: 'branch_manager',
        branch: user._id,
        school: user.tenant,
        branchScope: 'SPECIFIC',
        rbacRole: user.rbacRole,
        permissions: permissions
      };

      return res.json({
        ...branchUser,
        school: user.tenant,
        token: await issueTokens(res, branchUser),
      });
    }

    // Issue final tokens for regular user
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      customId: user.customId,
      role: user.role,
      branchScope: user.branchScope || 'SPECIFIC',
      permissions: user.permissions || [],
      school: user.school,
      schoolProfileCompleted: user.schoolProfileCompleted,
      token: await issueTokens(res, user),
    });

  } catch (error) {
    console.error('2FA Verification Error:', error);
    res.status(500).json({
      message: 'Something went wrong',
      userMessage: 'Something went wrong. Please try again later.'
    });
  }
};

// @desc    Resend 2FA OTP
// @route   POST /api/auth/resend-2fa
// @access  Public
export const resend2FA = async (req, res) => {
  const { userId, isBranchLogin } = req.body;

  try {
    if (!userId) {
      return res.status(400).json({
        message: 'Missing user ID',
        userMessage: 'User identification is required.'
      });
    }

    let user;
    if (isBranchLogin) {
      user = await Branch.findById(userId);
    } else {
      user = await User.findById(userId);
    }

    if (!user) {
      return res.status(404).json({
        message: 'Account not found',
        userMessage: 'Account not found.'
      });
    }

    const otp = generateOTP();
    user.otp = await hashOTP(otp);
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.otpAttempts = 0;
    await user.save();

    const email = isBranchLogin ? user.loginEmail : user.email;
    const emailSent = await sendOTPEmail(email, otp, user);
    
    if (!emailSent) {
      return res.status(500).json({
        message: 'Failed to send verification code',
        userMessage: 'We could not send the verification code to your email. Please try again later.'
      });
    }

    logAction(req, { action: '2FA_OTP_RESENT', module: 'AUTH', targetId: user._id, details: { email } });

    res.json({
      success: true,
      message: 'A new verification code has been sent to your email.'
    });

  } catch (error) {
    console.error('2FA Resend Error:', error);
    res.status(500).json({
      message: 'Something went wrong',
      userMessage: 'Something went wrong. Please try again later.'
    });
  }
};

// @desc    Verify Email
// @route   POST /api/auth/verify-email
// @access  Public
export const verifyEmail = async (req, res) => {
  const { token } = req.body;

  try {
    if (!token) {
      return res.status(400).json({
        message: 'Token is required',
        userMessage: 'Invalid verification link.'
      });
    }

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired token',
        userMessage: 'The verification link is invalid or has expired. Please request a new one.'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpires = undefined;
    await user.save();

    await logAction(req, {
      action: 'EMAIL_VERIFIED',
      module: 'AUTH',
      targetId: user._id
    });

    res.json({
      success: true,
      message: 'Email verified successfully',
      userMessage: 'Your email has been verified. You can now log in.'
    });
  } catch (error) {
    console.error('Verify Email Error:', error);
    res.status(500).json({
      message: 'Email verification failed',
      userMessage: 'Email verification failed. Please try again later.'
    });
  }
};

// @desc    Resend Email Verification
// @route   POST /api/auth/resend-verification
// @access  Public
export const resendVerification = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({
        message: 'Email is required',
        userMessage: 'Please provide your email address.'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        userMessage: 'No account found with this email address.'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        message: 'Email already verified',
        userMessage: 'This email is already verified. Please log in.'
      });
    }

    // Generate new verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Send verification email - FAIL if email doesn't send!
    try {
      await sendVerificationEmail(user, verificationToken);
    } catch (emailError) {
      console.error('Failed to resend verification email:', emailError.stack);
      // Rollback: clear token from user if email failed
      user.emailVerificationToken = undefined;
      user.emailVerificationTokenExpires = undefined;
      await user.save();
      
      return res.status(500).json({
        message: 'Failed to send verification email',
        userMessage: 'Failed to send verification email. Please try again later.',
        error: emailError.message
      });
    }

    await logAction(req, {
      action: 'EMAIL_VERIFICATION_RESENT',
      module: 'AUTH',
      targetId: user._id
    });

    res.json({
      success: true,
      message: 'Verification email sent',
      userMessage: 'A new verification email has been sent to your address.'
    });
  } catch (error) {
    console.error('Resend Verification Error:', error.stack);
    res.status(500).json({
      message: 'Failed to resend verification',
      userMessage: 'Failed to resend verification email. Please try again later.'
    });
  }
};

// @desc    Send test email
// @route   POST /api/auth/test-email
// @access  Public
export const testEmail = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({
        message: 'Email is required',
        userMessage: 'Please provide an email address to send a test email to.'
      });
    }

    const result = await sendTestEmail(email);
    res.json({
      success: true,
      message: 'Test email sent successfully!',
      userMessage: 'Test email sent successfully! Please check your inbox.',
      result
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      message: 'Failed to send test email',
      userMessage: 'Failed to send test email. Please check your email configuration.',
      error: error.message
    });
  }
};
