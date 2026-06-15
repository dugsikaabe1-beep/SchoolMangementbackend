import Role from '../models/Role.js';
import Permission from '../models/Permission.js';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import { logAction } from '../utils/auditLogger.js';

/**
 * @desc    Get all roles for the current tenant
 * @route   GET /api/rbac/roles
 * @access  Private (School Admin)
 */
export const getRoles = async (req, res) => {
  try {
    const roles = await Role.find({ 
      tenant: req.schoolId,
      isDeleted: false 
    }).populate('branchScope', 'name');
    
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Create a new role
 * @route   POST /api/rbac/roles
 * @access  Private (School Admin)
 */
export const createRole = async (req, res) => {
  try {
    const { name, code, description, permissions, branchScope } = req.body;
    
    // Check if role code already exists in this tenant
    const existing = await Role.findOne({ 
      tenant: req.schoolId, 
      code: code.toUpperCase(),
      isDeleted: false 
    });
    
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'Role code already exists for this school.' 
      });
    }

    const role = await Role.create({
      tenant: req.schoolId,
      name,
      code: code.toUpperCase(),
      description,
      permissions: permissions || [],
      branchScope: branchScope || null,
      createdBy: req.user._id
    });

    logAction(req, {
      action: 'ROLE_CREATED',
      module: 'RBAC',
      targetId: role._id,
      details: { name: role.name, code: role.code }
    });

    res.status(201).json({ success: true, data: role });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update an existing role
 * @route   PUT /api/rbac/roles/:id
 * @access  Private (School Admin)
 */
export const updateRole = async (req, res) => {
  try {
    const { name, description, permissions, branchScope, isActive } = req.body;
    
    const role = await Role.findOne({ 
      _id: req.params.id, 
      tenant: req.schoolId,
      isDeleted: false
    });

    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    if (role.isSystemRole && req.body.code && req.body.code !== role.code) {
      return res.status(400).json({ success: false, message: 'Cannot change system role code' });
    }

    role.name = name || role.name;
    role.description = description || role.description;
    role.permissions = permissions || role.permissions;
    role.branchScope = branchScope !== undefined ? branchScope : role.branchScope;
    role.isActive = isActive !== undefined ? isActive : role.isActive;
    role.updatedBy = req.user._id;

    await role.save();

    logAction(req, {
      action: 'ROLE_UPDATED',
      module: 'RBAC',
      targetId: role._id,
      details: { name: role.name }
    });

    res.json({ success: true, data: role });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all permissions available for the tenant
 * @route   GET /api/rbac/permissions
 * @access  Private (School Admin)
 */
export const getPermissions = async (req, res) => {
  try {
    // Return all permissions (including system ones)
    const permissions = await Permission.find({
      $or: [
        { tenant: req.schoolId },
        { isSystemPermission: true }
      ],
      isActive: true
    }).sort({ module: 1, name: 1 });
    
    res.json({ success: true, data: permissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Create a new permission
 * @route   POST /api/rbac/permissions
 * @access  Private (School Admin)
 */
export const createPermission = async (req, res) => {
  try {
    const { name, code, module, action, resource, description } = req.body;
    
    // Check if permission code already exists for this tenant
    const existing = await Permission.findOne({ 
      tenant: req.schoolId, 
      code: code.toLowerCase() 
    });
    
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'Permission code already exists for this school.' 
      });
    }

    const permission = await Permission.create({
      tenant: req.schoolId,
      name,
      code: code.toLowerCase(),
      module: module.toLowerCase(),
      action: action.toLowerCase(),
      resource: resource.toLowerCase(),
      description,
      createdBy: req.user._id
    });

    logAction(req, {
      action: 'PERMISSION_CREATED',
      module: 'RBAC',
      targetId: permission._id,
      details: { name: permission.name, code: permission.code }
    });

    res.status(201).json({ success: true, data: permission });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update a permission
 * @route   PUT /api/rbac/permissions/:id
 * @access  Private (School Admin)
 */
export const updatePermission = async (req, res) => {
  try {
    const { name, module, action, resource, description, isActive } = req.body;
    
    const permission = await Permission.findOne({ 
      _id: req.params.id, 
      tenant: req.schoolId 
    });

    if (!permission) {
      return res.status(404).json({ success: false, message: 'Permission not found' });
    }

    if (permission.isSystemPermission) {
      return res.status(400).json({ success: false, message: 'Cannot edit system permission' });
    }

    permission.name = name || permission.name;
    permission.module = (module || permission.module).toLowerCase();
    permission.action = (action || permission.action).toLowerCase();
    permission.resource = (resource || permission.resource).toLowerCase();
    permission.description = description || permission.description;
    permission.isActive = isActive !== undefined ? isActive : permission.isActive;
    permission.updatedBy = req.user._id;

    await permission.save();

    logAction(req, {
      action: 'PERMISSION_UPDATED',
      module: 'RBAC',
      targetId: permission._id,
      details: { name: permission.name }
    });

    res.json({ success: true, data: permission });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Delete a permission
 * @route   DELETE /api/rbac/permissions/:id
 * @access  Private (School Admin)
 */
export const deletePermission = async (req, res) => {
  try {
    const permission = await Permission.findOne({ 
      _id: req.params.id, 
      tenant: req.schoolId 
    });

    if (!permission) {
      return res.status(404).json({ success: false, message: 'Permission not found' });
    }

    if (permission.isSystemPermission) {
      return res.status(400).json({ success: false, message: 'Cannot delete system permission' });
    }

    await permission.remove();

    logAction(req, {
      action: 'PERMISSION_DELETED',
      module: 'RBAC',
      targetId: req.params.id,
      details: { name: permission.name }
    });

    res.json({ success: true, message: 'Permission deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Assign a role to a branch
 * @route   PUT /api/rbac/assign-branch/:branchId
 * @access  Private (School Admin)
 */
export const assignRoleToBranch = async (req, res) => {
  try {
    const { roleId } = req.body;
    const { branchId } = req.params;

    const branch = await Branch.findOne({ _id: branchId, tenant: req.schoolId });
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    const role = await Role.findOne({ _id: roleId, tenant: req.schoolId });
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    branch.rbacRole = roleId;
    await branch.save();

    logAction(req, {
      action: 'BRANCH_ROLE_ASSIGNED',
      module: 'RBAC',
      targetId: branch._id,
      details: { branchName: branch.name, roleName: role.name }
    });

    res.json({ success: true, message: 'Role assigned to branch successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
