import mongoose from 'mongoose';

/**
 * Role Schema for RBAC
 * School Admin can create, edit, delete, and assign roles
 * Roles can be scoped to specific branches or be tenant-wide
 */
const roleSchema = new mongoose.Schema(
  {
    // Tenant (School) this role belongs to
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },
    
    // Role name (e.g., Branch Admin, Teacher, Accountant, Exam Officer)
    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    
    // Role code for programmatic access (e.g., BRANCH_ADMIN, TEACHER)
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true
    },
    
    // Description of the role
    description: {
      type: String,
      trim: true
    },
    
    // Permissions assigned to this role
    permissions: [{
      type: String,
      trim: true
    }],
    
    // Branch scope: null = tenant-wide, ObjectId = specific branch only
    branchScope: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null
    },
    
    // Whether this role is active
    isActive: {
      type: Boolean,
      default: true
    },
    
    // Whether this is a system role (cannot be deleted)
    isSystemRole: {
      type: Boolean,
      default: false
    },
    
    // Priority for permission resolution (higher = more specific)
    priority: {
      type: Number,
      default: 0
    },
    
    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for efficient queries
roleSchema.index({ tenant: 1, isActive: 1 });
roleSchema.index({ tenant: 1, branchScope: 1, isActive: 1 });
roleSchema.index({ code: 1, tenant: 1 }, { unique: true, sparse: true });

// Virtual to check if role is tenant-wide
roleSchema.virtual('isTenantWide').get(function() {
  return !this.branchScope;
});

// Compound unique index: role code must be unique per tenant
roleSchema.index({ tenant: 1, code: 1 }, { unique: true });

const Role = mongoose.model('Role', roleSchema);
export default Role;
