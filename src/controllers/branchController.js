import Branch from '../models/Branch.js';
import User from '../models/User.js';

/**
 * @desc    Get all branches for the current school
 * @route   GET /api/branches
 * @access  Private (School Admin)
 */
export const getBranches = async (req, res) => {
  try {
    const branches = await Branch.find({ 
      tenant: req.schoolId,
      deletedAt: { $exists: false }
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: branches
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Create a new branch
 * @route   POST /api/branches
 * @access  Private (School Admin)
 */
export const createBranch = async (req, res) => {
  try {
    const { name, code, phone, email, address, city, country, principalName, loginEmail, password } = req.body;

    const branch = await Branch.create({
      tenant: req.schoolId,
      name,
      code,
      phone,
      email,
      address,
      city,
      country,
      principalName,
      loginEmail,
      password,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      data: branch
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Update a branch
 * @route   PUT /api/branches/:id
 * @access  Private (School Admin)
 */
export const updateBranch = async (req, res) => {
  try {
    const { loginEmail, password, ...otherData } = req.body;
    const branch = await Branch.findOne({ _id: req.params.id, tenant: req.schoolId });

    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    // Only update credentials if provided
    if (loginEmail) branch.loginEmail = loginEmail;
    if (password) branch.password = password;

    Object.assign(branch, otherData);
    branch.updatedBy = req.user._id;
    await branch.save();

    res.json({
      success: true,
      data: branch
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Soft delete a branch
 * @route   DELETE /api/branches/:id
 * @access  Private (School Admin)
 */
export const deleteBranch = async (req, res) => {
  try {
    const branch = await Branch.findOne({ _id: req.params.id, tenant: req.schoolId });

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    branch.deletedAt = new Date();
    branch.deletedBy = req.user._id;
    branch.status = 'archived';
    await branch.save();

    res.json({
      success: true,
      message: 'Branch archived successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Toggle branch status (activate/deactivate)
 * @route   PUT /api/branches/:id/toggle-status
 * @access  Private (School Admin)
 */
export const toggleBranchStatus = async (req, res) => {
  try {
    const branch = await Branch.findOne({ _id: req.params.id, tenant: req.schoolId });

    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    branch.status = branch.status === 'active' ? 'inactive' : 'active';
    branch.updatedBy = req.user._id;
    await branch.save();

    res.json({
      success: true,
      message: `Branch ${branch.status === 'active' ? 'activated' : 'deactivated'} successfully`,
      data: branch
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get branch statistics
 * @route   GET /api/branches/:id/stats
 * @access  Private (School Admin / Branch Manager)
 */
export const getBranchStats = async (req, res) => {
  try {
    const branchId = req.params.id;
    
    // Validate branch belongs to tenant
    const branch = await Branch.findOne({ _id: branchId, tenant: req.schoolId });
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    const studentCount = await User.countDocuments({ branch: branchId, role: 'student', status: 'active' });
    const teacherCount = await User.countDocuments({ branch: branchId, role: 'teacher', status: 'active' });
    
    // In a real app, you'd aggregate revenue/expenses from finance models
    // For now, returning basic counts
    
    res.json({
      success: true,
      data: {
        studentCount,
        teacherCount,
        name: branch.name,
        status: branch.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
