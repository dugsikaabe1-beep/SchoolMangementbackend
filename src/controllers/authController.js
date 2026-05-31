import mongoose from 'mongoose';
import User from '../models/User.js';
import ClassSubject from '../models/ClassSubject.js';
import School from '../models/School.js';
import {
  generateAccessToken,
  generateRefreshToken,
  setTokenCookies,
  clearRefreshCookie,
  verifyRefreshToken,
} from '../utils/tokenUtils.js';
import { escapeRegex } from '../utils/securityUtils.js';

// Password validation helper
const issueTokens = (res, user) => {
  const access = generateAccessToken(user);
  setTokenCookies(res, generateRefreshToken(user));
  return access;
};

// @desc    Auth student & get token
// @route   POST /api/auth/student-login
// @access  Public
export const studentLogin = async (req, res) => {
  const { customId, password } = req.body;
  // Strictly use tenant detected from header/host
  const selectedSchoolId = req.schoolId;
  
  if (!selectedSchoolId) {
    return res.status(400).json({
      message: 'Missing Tenant ID',
      userMessage: 'School identification is missing. Please ensure you are using the correct school app.'
    });
  }

  console.log(`Student login attempt: ID=${customId}, SchoolID=${selectedSchoolId}`);
  try {
    const safeId = escapeRegex(String(customId));
    const user = await User.findOne({
      customId: { $regex: new RegExp(`^${safeId}$`, 'i') },
      role: 'student',
      school: selectedSchoolId
    })
      .populate('school')
      .populate('class');

    if (!user) {
      console.log(`Student not found: ID=${customId}, SchoolID=${selectedSchoolId}. Checked User collection for role=student, school=${selectedSchoolId}`);
      return res.status(401).json({ 
        message: 'Invalid Student ID or password',
        userMessage: !selectedSchoolId
          ? 'Login failed: no school selected. Please go back and select your school.'
          : 'Invalid Student ID or password. Please check and try again.'
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

    // Guard: Mode B students have no password yet
    if (!user.password || user.credentialsGenerated === false) {
      return res.status(403).json({
        message: 'Credentials not yet generated',
        userMessage: 'Your login credentials have not been set up yet. Please contact your school administrator to generate your account credentials.'
      });
    }

    const isMatch = await user.matchPassword(password);
    if (isMatch) {
      console.log(`Student login successful: ${customId}`);
      
      // Proactively ensure student has a customId if missing (though they usually log in with it)
      if (!user.customId) {
        const count = await User.countDocuments({ role: 'student', school: user.school?._id || user.school || selectedSchoolId });
        user.customId = `S-${(count + 1).toString().padStart(4, '0')}`;
        await user.save();
      }

      let classPayload = user.class;
      if (user.class) {
        const assignments = await ClassSubject.find({ class: user.class._id, school: user.school?._id || user.school || selectedSchoolId })
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
      res.json({
        _id:      user._id,
        name:     user.name,
        customId: user.customId,
        email:    user.email,
        role:     user.role,
        school:   user.school,
        class:    classPayload,
        token:    issueTokens(res, user),
      });
    } else {
      console.log(`Student password mismatch: ${customId}`);
      res.status(401).json({ 
        message: 'Invalid Student ID or password',
        userMessage: 'Invalid Student ID or password. Please check and try again.'
      });
    }
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
  const { customId, password } = req.body;
  // Strictly use tenant detected from header/host
  const selectedSchoolId = req.schoolId;
  
  if (!selectedSchoolId) {
    return res.status(400).json({
      message: 'Missing Tenant ID',
      userMessage: 'School identification is missing. Please ensure you are using the correct school app.'
    });
  }

  console.log(`Teacher login attempt: ID=${customId}, SchoolID=${selectedSchoolId}`);
  try {
    const safeId = escapeRegex(String(customId));
    const user = await User.findOne({
      customId: { $regex: new RegExp(`^${safeId}$`, 'i') },
      role: 'teacher',
      school: selectedSchoolId
    }).populate('school');

    if (!user) {
      console.log(`Teacher not found: ID=${customId}, SchoolID=${selectedSchoolId}`);
      return res.status(401).json({ 
        message: 'Invalid Teacher ID or password',
        userMessage: !selectedSchoolId
          ? 'Login failed: no school selected. Please go back and select your school.'
          : 'Invalid Teacher ID or password. Please check and try again.'
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

    const isMatch = await user.matchPassword(password);
    if (isMatch) {
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
        subjects, // array of subjects the teacher handles
        token:    issueTokens(res, user),
      });
    } else {
      console.log(`Teacher password mismatch: ${customId}`);
      res.status(401).json({ 
        message: 'Invalid Teacher ID or password',
        userMessage: 'Invalid Teacher ID or password. Please check and try again.'
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
      if (user && (await user.matchPassword(password))) {
        return res.json({
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          token: issueTokens(res, user),
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
      role: 'admin',
      school: selectedSchoolId
    }).populate('school');

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        school: user.school,
        token: issueTokens(res, user),
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

/**
 * @desc    Get current tenant information
 * @route   GET /api/auth/tenant
 * @access  Public
 */
export const getTenantInfo = async (req, res) => {
  if (req.isSuperAdminRoute) {
    return res.json({ 
      type: 'superadmin',
      name: 'Super Admin Dashboard' 
    });
  }

  if (!req.school) {
    // In development (localhost), no subdomain is detected — allow the app to load.
    // The login page will handle school-level authentication.
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      return res.json({
        type: 'dev',
        name: 'EduManage (Development)'
      });
    }
    return res.status(404).json({ 
      message: 'School not found',
      userMessage: 'The school you are trying to access does not exist.'
    });
  }

  res.json({
    type: 'school',
    _id: req.school._id,
    name: req.school.name,
    logo: req.school.logo,
    subdomain: req.school.subdomain,
    isActive: req.school.isActive,
    subscriptionStatus: req.school.subscription?.paymentStatus
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

    // Support for shared domain login (Super Admin host)
    // If no activeSchoolId is detected from domain, find the user across all tenants
    if (req.isSuperAdminRoute || !activeSchoolId) {
      if (!email && !customId) {
        return res.status(400).json({
          message: 'Email or ID required',
          userMessage: 'Please enter your email or your school ID to continue.',
        });
      }

      // Search for user globally by email or customId
      const query = email 
        ? { email: email.trim().toLowerCase() } 
        : { customId: { $regex: new RegExp(`^${escapeRegex(String(customId))}$`, 'i') } };

      user = await User.findOne(query).populate('school');

      if (!user) {
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
            token: issueTokens(res, user),
          });
        }
      }

      // If it's a school user, they MUST have a school associated
      // EXCEPT for school admins who need to log in to complete their profile
      const isNewAdmin = ['schooladmin', 'school_admin', 'admin'].includes(user.role) && !user.school;
      
      if (!user.school && !isNewAdmin) {
        return res.status(403).json({
          message: 'No school associated',
          userMessage: 'Your account is not associated with any school. Please contact support.',
        });
      }

      // Set the school context from the found user (if available)
      activeSchoolId = user.school ? user.school._id : null;
    } else {
      // If we are on a specific school domain, scope the search to that school
      const query = email 
        ? { email: email.trim().toLowerCase(), school: activeSchoolId } 
        : { 
            customId: { $regex: new RegExp(`^${escapeRegex(String(customId))}$`, 'i') },
            school: activeSchoolId 
          };
      
      user = await User.findOne(query).populate('school');
    }

    if (user && (await user.matchPassword(password))) {
      // Final safety check for tenant mismatch if we are on a subdomain
      if (req.schoolId && user.school && user.school._id.toString() !== req.schoolId.toString()) {
        return res.status(403).json({
          message: 'Tenant mismatch',
          userMessage: 'You are not authorized to log in for this school.',
        });
      }

      // Handle inactive/blocked school (if school exists)
      if (user.school) {
        const school = user.school;
        if (school.subscription?.blockedByAdmin) {
          return res.status(403).json({
            message: 'School blocked',
            userMessage: `Your school "${school.name}" has been suspended.`,
          });
        }
        if (!school.isActive) {
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

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        customId: user.customId,
        role: user.role,
        school: user.school,
        schoolProfileCompleted: user.schoolProfileCompleted,
        token: issueTokens(res, user),
      });
    } else {
      res.status(401).json({
        message: 'Invalid credentials',
        userMessage: 'Invalid login credentials. Please check and try again.',
      });
    }
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

    const base = {
      _id:      user._id,
      name:     user.name,
      email:    user.email,
      customId: user.customId, // This is crucial for the frontend!
      role:     user.role,
      school:   user.school,
      phone:    user.phone || 'N/A',
      profileImage: user.profileImage,
      age:      user.age || user.teacherAge || 'N/A',
      status:   user.status,
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

// @desc    Reset password (Self or Admin)
// @route   PUT /api/auth/reset-password
// @access  Private (Self) or Private/Admin (For others)
export const resetPassword = async (req, res) => {
  const { userId, newPassword } = req.body;

  try {
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
      if (!req.schoolId || !user.school) {
        return res.status(403).json({
          message: 'Tenant scope required',
          userMessage: 'Password reset is not allowed in this context.',
        });
      }
      if (user.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({
          message: 'Cross-tenant password reset forbidden',
          userMessage: 'You cannot reset passwords for users in another school.',
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
    res.status(500).json({
      message: 'Something went wrong. Please try again later.',
      userMessage: 'Something went wrong. Please try again later.',
    });
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

