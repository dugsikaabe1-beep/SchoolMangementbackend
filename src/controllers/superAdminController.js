import School from '../models/School.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import {
  generateAccessToken,
  generateRefreshToken,
  setTokenCookies,
} from '../utils/tokenUtils.js';

const SUPER_ADMIN_ROLES = ['superadmin', 'super_admin'];
const SCHOOL_ADMIN_ROLES = ['schooladmin', 'school_admin'];

const isSuperAdminUser = (user) =>
  SUPER_ADMIN_ROLES.includes(user?.role) || user?.isSuperAdmin === true;

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

    const access = generateAccessToken(user);
    setTokenCookies(res, generateRefreshToken(user));

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: 'superadmin',
      isSuperAdmin: true,
      token: access,
    });
  } catch (error) {
    console.error('Super Admin Login Error:', error);
    res.status(500).json({
      message: 'Login failed',
      userMessage: 'An error occurred during login. Please try again.'
    });
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

// --- Get Dashboard Stats ---
export const getDashboardStats = async (req, res) => {
  try {
    const totalSchools = await School.countDocuments();
    const activeSchools = await School.countDocuments({ isActive: true });
    const inactiveSchools = await School.countDocuments({ isActive: false });
    
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

    res.json({
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
      subscriptionTypes: subscriptionTypes.reduce((acc, curr) => {
        acc[curr._id || 'trial'] = curr.count;
        return acc;
      }, {})
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

// --- Register School Admin (Super Admin only provides email & password) ---
export const createSchoolAdmin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
        userMessage: 'Please provide both email and password.'
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

    // Create school admin (no school assigned yet, profile not completed)
    // NOTE: Don't hash password here - the User model pre-save hook will handle it
    // Extract name from email prefix as temporary name
    const tempName = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const admin = await User.create({
      name: tempName,
      email,
      password, // Pass plain password - pre-save hook will hash it
      role: 'schooladmin',
      schoolProfileCompleted: false,
      status: 'active'
    });

    res.status(201).json({
      message: 'School admin created successfully',
      userMessage: 'School admin account created successfully! They can now login and complete their school profile.',
      admin: {
        _id: admin._id,
        email: admin.email,
        role: admin.role,
        schoolProfileCompleted: false
      }
    });
  } catch (error) {
    console.error('Create School Admin Error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({
      message: `Failed to create school admin: ${error.message}`,
      userMessage: `Failed to create school admin: ${error.message}`
    });
  }
};
