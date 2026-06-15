import mongoose from 'mongoose';

/**
 * Permission Schema for RBAC
 * Defines granular permissions for different modules and actions
 * School Admin can create, edit, delete, and assign permissions
 */
const permissionSchema = new mongoose.Schema(
  {
    // Tenant (School) this permission belongs to
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },
    
    // Permission code (e.g., students.view, finance.manage, exams.create)
    code: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },
    
    // Display name (e.g., "View Students", "Manage Finance")
    name: {
      type: String,
      required: true,
      trim: true
    },
    
    // Description of what this permission allows
    description: {
      type: String,
      trim: true
    },
    
    // Module this permission belongs to (e.g., students, finance, exams)
    module: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },
    
    // Action type (e.g., view, create, edit, delete, manage)
    action: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      enum: ['view', 'create', 'edit', 'delete', 'manage', 'approve', 'export', 'import']
    },
    
    // Resource this permission applies to (e.g., students, payments, exams)
    resource: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    
    // Permission group for organization (e.g., Students Module, Finance Module)
    group: {
      type: String,
      trim: true
    },
    
    // Whether this permission is active
    isActive: {
      type: Boolean,
      default: true
    },
    
    // Whether this is a system permission (cannot be deleted)
    isSystemPermission: {
      type: Boolean,
      default: false
    },
    
    // Priority for permission resolution
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
permissionSchema.index({ tenant: 1, isActive: 1 });
permissionSchema.index({ tenant: 1, module: 1, isActive: 1 });
permissionSchema.index({ code: 1, tenant: 1 }, { unique: true, sparse: true });

// Virtual to get full permission string (module.action.resource)
permissionSchema.virtual('fullCode').get(function() {
  return `${this.module}.${this.action}.${this.resource}`;
});

// Compound unique index: code must be unique per tenant
permissionSchema.index({ tenant: 1, code: 1 }, { unique: true });

const Permission = mongoose.model('Permission', permissionSchema);
export default Permission;
