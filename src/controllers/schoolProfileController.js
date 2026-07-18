import User from '../models/User.js';
import School from '../models/School.js';
import Plan from '../models/Plan.js';
import Branch from '../models/Branch.js';
import asyncHandler from 'express-async-handler';

// @desc    Check school profile completion status
// @route   GET /api/admin/school-profile-status
// @access  Private (Admin only)
export const checkProfileStatus = asyncHandler(async (req, res) => {
  const admin = await User.findById(req.user._id).select('+school');
  
  if (!admin) {
    res.status(404);
    throw new Error('Admin not found');
  }
  
  // Check if admin role is 'admin' or 'schooladmin'
  const isAdminRole = ['admin', 'schooladmin', 'school_admin'].includes(admin.role);
  if (!isAdminRole) {
    return res.json({
      completed: true,
      schoolExists: true,
      schoolProfileCompleted: true,
      requiresProfileCompletion: false
    });
  }
  
  const school = admin.school ? await School.findById(admin.school) : null;

  // ── Check actual required fields on the School document ──
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
      if (!val || (typeof val === 'string' && !val.trim())) {
        missingFields.push({ field, label });
      }
    }
  }

  const isComplete = !!school && admin.schoolProfileCompleted === true && missingFields.length === 0;

  res.json({
    completed: isComplete,
    schoolProfileCompleted: isComplete,
    school: school || null,
    missingFields,
    onboarding: school?.onboarding,
    role: admin.role,
    requiresProfileCompletion: !isComplete
  });
});

// @desc    Complete school profile for school admin
// @route   POST /api/admin/complete-school-profile
// @access  Private (Admin only)
export const completeSchoolProfile = asyncHandler(async (req, res) => {
  const admin = await User.findById(req.user._id);
  
  if (!admin) {
    res.status(404);
    throw new Error('Admin not found');
  }
  
  // Check if admin role is 'admin' or 'schooladmin'
  const isAdminRole = ['admin', 'schooladmin', 'school_admin'].includes(admin.role);
  if (!isAdminRole) {
    res.status(403);
    throw new Error('Only school admins can complete school profile');
  }
  
  // Accept both 'name' and 'schoolName' for backward compatibility
  const schoolName = req.body.name || req.body.schoolName;
  const {
    schoolType,
    phone,
    country,
    city,
    address,
    email,
    merchantNumber,
    website,
    subscriptionType = 'trial',
    logo,
    principalName,
    motto,
    description
  } = req.body;
  
  // ── Validate all required fields ──
  const missing = [];
  if (!schoolName || !schoolName.toString().trim()) missing.push('School Name');
  if (!schoolType || !schoolType.toString().trim()) missing.push('School Type');
  if (!country || !country.toString().trim()) missing.push('Country');
  if (!city || !city.toString().trim()) missing.push('City');
  if (!logo) missing.push('School Logo');
  if (!address || !address.toString().trim()) missing.push('Address');
  if (!phone || !phone.toString().trim()) missing.push('Phone Number');
  if (!email || !email.toString().trim()) missing.push('School Email');
  if (!merchantNumber || !merchantNumber.toString().trim()) missing.push('Merchant / Account Number');

  if (missing.length > 0) {
    res.status(400);
    const error = new Error(`Required fields missing: ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }
  
  // Load intended plan from admin metadata if available
  let plan = null;
  if (admin.metadata?.intendedPlanId) {
    plan = await Plan.findById(admin.metadata.intendedPlanId);
  }
  
  // Check if school already exists for this admin
  let school = admin.school ? await School.findById(admin.school) : null;
  
  if (school) {
    // Update existing school
    school.name = schoolName.trim();
    school.schoolType = schoolType.trim();
    school.phone = phone.toString().trim();
    school.country = country.toString().trim();
    school.city = city.toString().trim();
    school.address = address.toString().trim();
    school.logo = logo || school.logo;
    school.email = email ? email.toString().trim().toLowerCase() : school.email;
    school.merchantNumber = merchantNumber ? merchantNumber.toString().trim() : school.merchantNumber;
    school.website = website || school.website;
    school.principal = principalName || school.principal;
    school.motto = motto || school.motto;
    school.description = description || school.description;
    // Update plan if provided
    if (plan) {
      school.subscription.plan = plan._id;
      school.subscription.limits = {
        students: plan.limits.students,
        teachers: plan.limits.teachers,
        branches: plan.limits.branches,
        admins: plan.limits.admins,
        storage: plan.limits.storage,
        sms: plan.limits.sms,
        email: plan.limits.email
      };
      if (plan.features && plan.features.length > 0) {
        school.settings.enabledModules = [...plan.features];
      }
    }
    
    await school.save();

    if (!admin.schoolProfileCompleted) {
      admin.schoolProfileCompleted = true;
      await admin.save();
    }
  } else {
    const code = `SCH${Date.now().toString().slice(-6)}`;

    school = await School.create({
      name: schoolName.trim(),
      subdomain: '', // auto-generated by School pre-validate hook
      schoolType: schoolType.trim(),
      phone: phone.toString().trim(),
      country: country.toString().trim(),
      city: city.toString().trim(),
      address: address.toString().trim(),
      logo,
      code,
      email: email ? email.toString().trim().toLowerCase() : '',
      merchantNumber: merchantNumber ? merchantNumber.toString().trim() : '',
      website: website || '',
      admin: admin._id,
      subscription: { 
        type: subscriptionType,
        plan: plan ? plan._id : undefined,
        limits: plan ? {
          students: plan.limits.students,
          teachers: plan.limits.teachers,
          branches: plan.limits.branches,
          admins: plan.limits.admins,
          storage: plan.limits.storage,
          sms: plan.limits.sms,
          email: plan.limits.email
        } : undefined
      },
      settings: plan && plan.features ? {
        enabledModules: [...plan.features]
      } : undefined,
      isActive: true,
      status: 'active',
      principal: principalName || '',
      motto: motto || '',
      description: description || ''
    });
    
    // Create Main Branch automatically
    const mainBranch = await Branch.create({
      tenant: school._id,
      name: 'Main Branch',
      code: 'MAIN',
      address,
      city,
      country,
      phone,
      email,
      principalName,
      isMain: true,
      createdBy: admin._id
    });
    
    admin.school = school._id;
    admin.branch = mainBranch._id;
    admin.branchScope = 'ALL_BRANCHES'; // School Admin can see all branches
    admin.schoolProfileCompleted = true;
    // Clear metadata after use
    admin.metadata = {};
    await admin.save();
  }
  
  res.json({
    message: 'School profile completed successfully',
    userMessage: 'School profile completed successfully! You can now access all features.',
    school: {
      _id: school._id,
      name: school.name,
      schoolType: school.schoolType,
      phone: school.phone,
      country: school.country,
      city: school.city,
      address: school.address,
      logo: school.logo,
      subdomain: school.subdomain,
      email: school.email,
      merchantNumber: school.merchantNumber,
      subscription: school.subscription,
      description: school.description
    }
  });
});
