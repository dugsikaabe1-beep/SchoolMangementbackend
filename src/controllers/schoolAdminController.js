import School from '../models/School.js';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import jwt from 'jsonwebtoken';
import { escapeRegex } from '../utils/securityUtils.js';
import { getEnabledFeaturesForSchool } from '../utils/featureAccess.js';

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

    let schoolData = user.school;
    if (schoolData?._id || schoolData) {
      const enabledFeatures = await getEnabledFeaturesForSchool(schoolData._id || schoolData);
      schoolData = { ...(schoolData.toObject ? schoolData.toObject() : schoolData), enabledFeatures };
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: normalizedRole,
      schoolProfileCompleted: user.schoolProfileCompleted,
      school: schoolData,
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
    schoolType,
    country,
    city,
    logo,
    address, 
    phone, 
    email,
    merchantNumber,
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

    // ── Validate all required fields ──
    const missing = [];
    if (!name || !name.trim()) missing.push('School Name');
    if (!schoolType || !schoolType.trim()) missing.push('School Type');
    if (!country || !country.trim()) missing.push('Country');
    if (!city || !city.trim()) missing.push('City');
    if (!logo) missing.push('School Logo');
    if (!address || (typeof address === 'string' && !address.trim())) missing.push('Address');
    if (!phone || !phone.toString().trim()) missing.push('Phone Number');
    if (!email || !email.toString().trim()) missing.push('Email');
    if (!merchantNumber || !merchantNumber.toString().trim()) missing.push('Merchant / Account Number');

    if (missing.length > 0) {
      return res.status(400).json({
        message: 'Required fields missing',
        userMessage: `The following fields are required: ${missing.join(', ')}`,
        missingFields: missing
      });
    }

    // If school already exists, update it instead of blocking
    // (handles cases where new required fields like merchantNumber were added)
    if (user.school) {
      const school = await School.findById(user.school);
      if (school) {
        school.name = (name || school.name).toString().trim();
        school.schoolType = (schoolType || school.schoolType).toString().trim();
        school.country = (country || school.country).toString().trim();
        school.city = (city || school.city).toString().trim();
        if (logo) school.logo = logo;
        if (address) school.address = (typeof address === 'string' ? address : (address?.street || '')).trim();
        if (phone) school.phone = phone.toString().trim();
        if (email) school.email = email.toString().trim().toLowerCase();
        if (merchantNumber) school.merchantNumber = merchantNumber.toString().trim();
        if (principalName) school.principal = principalName;
        if (description) school.motto = description;
        await school.save();

        if (!user.schoolProfileCompleted) {
          user.schoolProfileCompleted = true;
          await user.save();
        }

        return res.json({
          message: 'School profile updated successfully',
          userMessage: 'Your school profile has been updated successfully!',
          school: {
            _id: school._id,
            name: school.name,
            schoolType: school.schoolType,
            country: school.country,
            city: school.city,
            logo: school.logo,
            subdomain: school.subdomain,
            address: school.address,
            email: school.email,
            phone: school.phone,
            merchantNumber: school.merchantNumber,
            subscription: school.subscription
          }
        });
      }
    }

    // ── Auto-generate subdomain from school name ──
    const baseSubdomain = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    let subdomain = baseSubdomain;
    const existingWithSubdomain = await School.findOne({ subdomain });
    if (existingWithSubdomain) {
      subdomain = `${baseSubdomain}-${Date.now().toString().slice(-4)}`;
    }

    // ── Auto-generate unique school code ──
    const code = `SCH${Date.now().toString().slice(-6)}`;

    const school = await School.create({
      name: name.trim(),
      schoolType: schoolType.trim(),
      country: country.trim(),
      city: city.trim(),
      subdomain,
      code,
      logo,
      address: typeof address === 'string' ? address.trim() : (address?.street || ''),
      phone: phone.toString().trim(),
      email: (email || user.email).toString().trim().toLowerCase(),
      merchantNumber: merchantNumber.toString().trim(),
      principal: principalName || '',
      motto: description || '',
      subscription: {
        type: subscriptionType || 'trial',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paymentStatus: 'Pending'
      },
      isActive: true,
      status: 'active'
    });

    // Auto create Main Branch
    const mainBranch = await Branch.create({
      tenant: school._id,
      name: 'Main Branch',
      code: 'MAIN',
      isMain: true,
      status: 'active',
      createdBy: user._id
    });

    user.school = school._id;
    user.branch = mainBranch._id; // Assign Main Branch to school admin!
    user.schoolProfileCompleted = true;
    await user.save();

    res.status(201).json({
      message: 'School profile completed successfully',
      userMessage: 'Your school profile has been created successfully! You can now access all features.',
      school: {
        _id: school._id,
        name: school.name,
        schoolType: school.schoolType,
        country: school.country,
        city: school.city,
        logo: school.logo,
        subdomain: school.subdomain,
        address: school.address,
        email: school.email,
        phone: school.phone,
        merchantNumber: school.merchantNumber,
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
    const user = await User.findById(userId).populate('school');

    // ── Check actual field completion on the School document ──
    const school = user.school;
    const requiredFields = {
      name: 'School Name',
      schoolType: 'School Type',
      country: 'Country',
      city: 'City',
      logo: 'School Logo',
      address: 'Address',
      phone: 'Phone Number',
      email: 'School Email',
      merchantNumber: 'Merchant / Account Number'
    };

    const missingFields = [];
    if (school) {
      for (const [field, label] of Object.entries(requiredFields)) {
        const val = school[field];
        if (field === 'logo') {
          if (!val || !val.url) missingFields.push({ field, label });
        } else if (!val || (typeof val === 'string' && !val.trim())) {
          missingFields.push({ field, label });
        }
      }
    }

    const isComplete = !!school && user.schoolProfileCompleted === true && missingFields.length === 0;

    res.json({
      schoolProfileCompleted: isComplete,
      school: school || null,
      missingFields,
      onboarding: school?.onboarding,
      role: user.role,
      requiresProfileCompletion: !isComplete
    });
  } catch (error) {
    console.error('Check Profile Status Error:', error);
    res.status(500).json({
      message: 'Failed to check profile status',
      userMessage: 'Failed to check profile status. Please try again.'
    });
  }
};

// --- Update Onboarding Progress ---
export const updateOnboarding = async (req, res) => {
  try {
    const { step, isCompleted } = req.body;
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user || !user.school) {
      return res.status(404).json({ message: 'School not found' });
    }

    const school = await School.findById(user.school);
    if (!school) return res.status(404).json({ message: 'School not found' });

    if (step) {
      school.onboarding.steps[step] = true;
      // Determine current step based on completed steps
      const stepOrder = ['schoolInfo', 'academicYear', 'branches', 'classes', 'teachers', 'students'];
      const nextStepIdx = stepOrder.indexOf(step) + 1;
      if (nextStepIdx < stepOrder.length) {
        school.onboarding.currentStep = nextStepIdx + 1;
      }
    }

    if (isCompleted !== undefined) {
      school.onboarding.isCompleted = isCompleted;
    }

    await school.save();

    res.json({
      message: 'Onboarding progress updated',
      onboarding: school.onboarding
    });
  } catch (error) {
    console.error('Update Onboarding Error:', error);
    res.status(500).json({
      message: 'Failed to update onboarding',
      userMessage: 'An error occurred while saving your progress.'
    });
  }
};

/**
 * Get enabled features for the current school.
 * Used by frontend to dynamically show/hide sidebar menus and features.
 */
export const getEnabledFeatures = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).populate({
      path: 'school',
      populate: { path: 'subscription.plan', select: 'features name code' }
    });

    if (!user || !user.school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'School profile not found.'
      });
    }

    const school = user.school;
    const features = await getEnabledFeaturesForSchool(school._id);
    const planFeatures = school.subscription?.plan?.features || [];

    // Check subscription status
    const subStatus = school.subscription?.status;
    const isExpired = school.subscription?.endDate
      ? new Date(school.subscription.endDate) < new Date()
      : false;

    res.json({
      success: true,
      features,
      allModules: planFeatures.includes('ALL_MODULES'),
      subscriptionStatus: subStatus,
      isExpired,
      planName: school.subscription?.plan?.name || 'No Plan',
      planCode: school.subscription?.plan?.code || 'NONE',
    });
  } catch (error) {
    console.error('Get Enabled Features Error:', error);
    res.status(500).json({
      message: 'Failed to fetch features',
      userMessage: 'Failed to fetch enabled features.'
    });
  }
};
