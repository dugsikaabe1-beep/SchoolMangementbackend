import User from '../models/User.js';
import School from '../models/School.js';
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
      schoolExists: true
    });
  }
  
  const school = await School.findOne({ _id: admin.school });
  
  res.json({
    completed: school ? true : false,
    school: school || null,
    requiresProfileCompletion: !school
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
  
  const {
    schoolName,
    address,
    phone,
    email,
    website,
    subscriptionType = 'trial',
    logo,
    principalName,
    motto
  } = req.body;
  
  // Validate required fields
  if (!schoolName || !address || !logo) {
    res.status(400);
    const missing = [];
    if (!schoolName) missing.push('schoolName');
    if (!address) missing.push('address');
    if (!logo) missing.push('logo');
    
    const error = new Error(`Required fields missing: ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }
  
  // Check if school already exists for this admin
  let school = await School.findOne({ admin: admin._id });
  
  if (school) {
    // Update existing school (keep existing subdomain)
    school.name = schoolName;
    school.logo = logo;
    school.address = address;   // plain string — matches schema type
    school.email = email;
    school.phone = phone;
    school.website = website;
    school.subscription = { type: subscriptionType };
    school.principal = principalName;
    school.motto = motto;
    
    await school.save();
  } else {
    // Generate a unique school code
    const code = `SCH${Date.now().toString().slice(-6)}`;
    
    // Auto-generate a subdomain from the school name
    // e.g. "Hamar Jajab School" => "hamar-jajab-school"
    const baseSubdomain = schoolName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')   // strip special chars
      .trim()
      .replace(/\s+/g, '-');           // spaces → hyphens

    // Ensure subdomain uniqueness — append short timestamp suffix if already taken
    let subdomain = baseSubdomain;
    const existingWithSubdomain = await School.findOne({ subdomain });
    if (existingWithSubdomain) {
      subdomain = `${baseSubdomain}-${Date.now().toString().slice(-4)}`;
    }

    // Create new school with all required fields
    school = await School.create({
      name: schoolName,
      subdomain,          // ← required field — auto-generated from school name
      logo,
      code,
      address,            // ← plain string — matches schema type
      email,
      phone,
      website,
      admin: admin._id,
      subscription: { type: subscriptionType },
      isActive: true,
      principal: principalName,
      motto
    });
    
    // Link school to admin and mark profile as complete
    admin.school = school._id;
    admin.schoolProfileCompleted = true;
    await admin.save();
  }
  
  res.json({
    message: 'School profile completed successfully',
    userMessage: 'School profile completed successfully! You can now access all features.',
    school: {
      _id: school._id,
      name: school.name,
      logo: school.logo,
      address: school.address,
      email: school.email,
      phone: school.phone,
      subdomain: school.subdomain,
      subscription: school.subscription
    }
  });
});
