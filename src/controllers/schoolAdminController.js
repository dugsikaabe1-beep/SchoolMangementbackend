import School from '../models/School.js';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { escapeRegex } from '../utils/securityUtils.js';

const SCHOOL_ADMIN_ROLES = ['schooladmin', 'school_admin'];
const SUPER_ADMIN_ROLES = ['superadmin', 'super_admin'];

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

/** Host/header tenant only — login resolves school from the admin's own account */
async function resolveSchoolIdForLogin(req) {
  return req.schoolId || null;
}

// --- School Admin Login ---
export const schoolAdminLogin = async (req, res) => {
  const { email, customId, password } = req.body;
  const identifier = (email || customId || '').toString().trim();

  if (!identifier || !password) {
    return res.status(400).json({
      message: 'Missing credentials',
      userMessage: 'Please enter your email (or ID) and password.',
    });
  }

  try {
    const selectedSchoolId = await resolveSchoolIdForLogin(req);

    const query = { role: { $in: SCHOOL_ADMIN_ROLES } };

    if (identifier.includes('@')) {
      query.email = identifier.toLowerCase();
    } else {
      const safeId = escapeRegex(identifier);
      query.customId = { $regex: new RegExp(`^${safeId}$`, 'i') };
    }

    if (selectedSchoolId) {
      query.school = selectedSchoolId;
    }

    let user = await User.findOne(query).populate('school');

    if (!user && identifier.includes('@')) {
      const byEmail = await User.findOne({ email: identifier.toLowerCase() });
      if (
        byEmail &&
        (SUPER_ADMIN_ROLES.includes(byEmail.role) || byEmail.isSuperAdmin)
      ) {
        return res.status(403).json({
          message: 'Wrong login portal',
          userMessage:
            'This email is a super admin account. Use Super Admin Login at /admin/login.',
          accountType: 'superadmin',
          redirectTo: '/admin/login',
        });
      }
    }

    if (!user) {
      return res.status(401).json({
        message: 'Invalid credentials',
        userMessage: 'Invalid email or password.',
      });
    }

    if (!user.password) {
      return res.status(403).json({
        message: 'Credentials not set',
        userMessage: 'This account has no password yet. Contact your administrator.',
      });
    }

    // Check if account is active
    if (user.status !== 'active') {
      return res.status(403).json({
        message: 'Account inactive',
        userMessage:
          'Your account has been deactivated by the administrator. Please contact the super admin to activate your account before you can log in.',
      });
    }

    // Check if school is active (not blocked by super admin)
    if (user.school) {
      const school = user.school;
      if (school.subscription?.blockedByAdmin) {
        const blockReason = school.subscription.blockedReason || 'Blocked by administrator';
        return res.status(403).json({
          message: 'School blocked by administrator',
          userMessage: `Your school "${school.name}" has been temporarily suspended by the super admin.\n\nReason: ${blockReason}\n\nPlease contact the super admin to discuss when your school can be reactivated.`,
        });
      }

      if (!school.isActive) {
        return res.status(403).json({
          message: 'School inactive',
          userMessage: `Your school "${school.name}" is currently inactive. Please contact the super admin to activate your school before you can log in.`,
        });
      }

      if (school.subscription?.endDate) {
        const now = new Date();
        const endDate = new Date(school.subscription.endDate);
        if (now > endDate) {
          return res.status(403).json({
            message: 'School subscription expired',
            userMessage: `Your school subscription has expired on ${endDate.toLocaleDateString()}. Please contact the super admin to renew your subscription.`,
          });
        }
      }
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        message: 'Invalid credentials',
        userMessage: 'Invalid email or password.',
      });
    }

    const normalizedRole = user.role === 'school_admin' ? 'schooladmin' : user.role;

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: normalizedRole,
      schoolProfileCompleted: user.schoolProfileCompleted,
      school: user.school,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('School Admin Login Error:', error);
    res.status(500).json({
      message: 'Login failed',
      userMessage: 'An error occurred during login. Please try again.',
    });
  }
};

// --- Complete School Profile ---
export const completeSchoolProfile = async (req, res) => {
  const { 
    name, 
    logo,
    address, 
    phone, 
    email,
    subscriptionType,
    principalName,
    description
  } = req.body;

  try {
    const userId = req.user._id;
    // Get the school admin
    const user = await User.findById(userId);
    if (!user || !SCHOOL_ADMIN_ROLES.includes(user.role)) {
      return res.status(403).json({
        message: 'Unauthorized',
        userMessage: 'Only school admins can complete this action.'
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: 'School name is required',
        userMessage: 'School name is required.'
      });
    }

    if (!logo) {
      return res.status(400).json({
        message: 'School logo is required',
        userMessage: 'School logo is required.'
      });
    }

    if (user.school) {
      return res.status(400).json({
        message: 'Profile already completed',
        userMessage: 'You have already completed your school profile.'
      });
    }

    const school = await School.create({
      name,
      logo,
      address: typeof address === 'string' ? address : (address?.street || ''),
      phone,
      email: email || user.email,
      subscription: {
        type: subscriptionType || 'trial',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paymentStatus: 'Pending'
      },
      isActive: true,
      status: 'active'
    });

    user.school = school._id;
    user.schoolProfileCompleted = true;
    await user.save();

    res.status(201).json({
      message: 'School profile completed successfully',
      userMessage: 'Your school profile has been created successfully!',
      school: {
        _id: school._id,
        name: school.name,
        email: school.email,
        subscription: school.subscription
      }
    });
  } catch (error) {
    console.error('Complete Profile Error:', error);
    res.status(500).json({
      message: 'Failed to complete profile',
      userMessage: 'Failed to complete school profile. Please try again.'
    });
  }
};

export const getSchoolProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).populate('school');

    if (!user || !user.school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'School profile not found.'
      });
    }

    res.json({
      school: user.school,
      schoolProfileCompleted: user.schoolProfileCompleted
    });
  } catch (error) {
    console.error('Get School Profile Error:', error);
    res.status(500).json({
      message: 'Failed to fetch school profile',
      userMessage: 'Failed to fetch school profile. Please try again.'
    });
  }
};

export const updateSchoolProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const updates = req.body;
    const user = await User.findById(userId);

    if (!user || !user.school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'School profile not found.'
      });
    }

    const school = await School.findByIdAndUpdate(
      user.school,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    res.json({
      message: 'School profile updated successfully',
      userMessage: 'School profile updated successfully.',
      school
    });
  } catch (error) {
    console.error('Update School Profile Error:', error);
    res.status(500).json({
      message: 'Failed to update school profile',
      userMessage: 'Failed to update school profile. Please try again.'
    });
  }
};

export const checkProfileStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).populate('school', 'name');

    res.json({
      schoolProfileCompleted: user.schoolProfileCompleted,
      school: user.school,
      role: user.role
    });
  } catch (error) {
    console.error('Check Profile Status Error:', error);
    res.status(500).json({
      message: 'Failed to check profile status',
      userMessage: 'Failed to check profile status. Please try again.'
    });
  }
};
