import mongoose from 'mongoose';
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
const normalizeProfileImage = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  if (typeof value === 'object' && Object.keys(value).length === 0) return undefined;
  return value;
};

const userSchema = new mongoose.Schema(
  {
    // Basic Information
    name: { type: String, required: true, trim: true },
    // Student-specific fields
    age: { 
      type: Number, 
      min: [4, 'Age must be at least 4'],
      max: [30, 'Age must not exceed 30']
    },
    monthlyFees: { 
      type: Number, 
      min: [0, 'Monthly fees cannot be negative'],
      default: 0
    },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    customId: { type: String, sparse: true }, // For Student ID or Teacher ID (Unique per tenant)
    password: { type: String, required: false }, // Optional: null when credentialsGenerated=false (delayed mode)
    credentialsGenerated: { type: Boolean, default: true }, // false = imported without credentials (Mode B)
    role: {
      type: String,
      enum: [
        'superadmin',
        'super_admin',
        'schooladmin',
        'school_admin',
        'admin',
        'branchmanager',
        'branch_manager',
        'teacher',
        'student',
        'parent',
        'accountant',
      ],
      default: 'student',
    },
    /** Increment to invalidate all issued JWTs (logout-all / password change). */
    tokenVersion: { type: Number, default: 0, min: 0 },
    isSuperAdmin: { type: Boolean, default: false },
    // For school admins: track if they've completed their school profile
    schoolProfileCompleted: { type: Boolean, default: false },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    branchScope: { 
      type: String, 
      enum: ['SPECIFIC', 'ALL_BRANCHES'], 
      default: 'SPECIFIC' 
    },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
    
    // Profile Information (Mixed supports legacy URL strings + Cloudinary metadata objects)
    profileImage: {
      type: mongoose.Schema.Types.Mixed,
      set: normalizeProfileImage,
    },
    phone: { 
      type: String, 
      trim: true,
      match: [/^[0-9+]*$/, 'Phone number can only contain digits and +']
    },
    
    // School Information
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' }, // Only for students
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }], // For teachers
    
    // Academic Information
    dateOfBirth: { type: Date },
    admissionDate: { type: Date, default: Date.now },
    status: { 
      type: String, 
      enum: ['active', 'inactive', 'suspended', 'graduated'], 
      default: 'active' 
    },
    
    // Parent Information (for students)
    parentName: { type: String, trim: true },
    parentPhone: { type: String, trim: true },
    parentEmail: { type: String, trim: true, lowercase: true },

    // Parent accounts: linked children (role === 'parent')
    linkedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    
    // Extended Student Profile
    gender:           { type: String, enum: ['Male', 'Female', 'Other'], default: undefined },
    placeOfBirth:     { type: String, trim: true },
    address:          { type: String, trim: true },
    motherName:       { type: String, trim: true },
    emergencyContact: { type: String, trim: true },
    entryTime:        { type: String, trim: true }, // e.g. "2024-09"
    studentMode:      { type: String, enum: ['Full-time', 'Part-time'], default: 'Full-time' },
    
    // Teacher Information
    workingStartTime: { type: String, trim: true }, // Format: HH:MM (e.g., "08:00")
    workingEndTime: { type: String, trim: true }, // Format: HH:MM (e.g., "14:00")
    teacherAge: {
      type: Number,
      min: [18, 'Teacher age must be at least 18'],
      max: [70, 'Teacher age must not exceed 70']
    },
    
    // RBAC: Role reference (optional - for flexible role-based permissions)
    rbacRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role'
    },
    
    // Permissions (RBAC) - can come from role or direct assignment
    permissions: [{ type: String }], // List of permission codes, e.g., ['students.view', 'finance.manage']
    
    // Permission overrides (user-specific permissions that override role permissions)
    permissionOverrides: [{
      permission: { type: String },
      granted: { type: Boolean, default: true } // true = grant, false = revoke
    }],
    
    // System Information
    lastLogin: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    refreshTokens: [{ type: String }],
    devices: [{
      deviceId: String,
      deviceName: String,
      lastUsed: Date,
      ip: String
    }],
    
    // Audit Information
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Security
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String },
    twoFactorRecoveryCodes: [{ type: String }],
    otp: { type: String },
    otpExpires: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    loginHistory: [{
      ip: String,
      browser: String,
      device: String,
      status: { type: String, enum: ['success', 'failed'] },
      timestamp: { type: Date, default: Date.now }
    }],
    activeSessions: [{
      sessionId: String,
      deviceId: String,
      deviceName: String,
      lastUsed: Date,
      ip: String
    }],
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    // Email Verification
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationTokenExpires: Date,

    // Temporary Exam Access
    temporaryExamAccess: { type: Boolean, default: false },
    temporaryAccessExpiresAt: { type: Date },
    temporaryAccessReason: { type: String, trim: true },
    temporaryAccessGrantedBy: { type: String, trim: true },
    temporaryAccessHistory: [
      {
        grantedBy: String,
        grantedAt: { type: Date, default: Date.now },
        expiresAt: Date,
        reason: String,
        status: { type: String, enum: ['active', 'expired', 'revoked'], default: 'active' }
      }
    ],
    
    // Metadata for onboarding
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual fields
userSchema.virtual('fullName').get(function() {
  return `${this.name}`;
});

// Method to get all effective permissions (role + direct + overrides)
// This method was duplicated, keeping the version using Set for better performance and clarity.

// Post-init hook to clean up empty string profileImage after loading from database
userSchema.post('init', function() {
  if (this.profileImage === '' || this.profileImage === null || (typeof this.profileImage === 'string' && this.profileImage.trim() === '')) {
    this.profileImage = undefined;
  }
});

// Indexes for better performance (avoid duplicate single-field indexes on school/class)
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ school: 1, email: 1 });
userSchema.index({ school: 1, customId: 1 }, { unique: true, sparse: true });
userSchema.index({ school: 1, branch: 1, role: 1 });
userSchema.index({ school: 1, branch: 1, isDeleted: 1 });
userSchema.index({ school: 1, role: 1, status: 1, isDeleted: 1 });
userSchema.index({ linkedStudents: 1 });

// Encrypt password before saving (only if password is set)
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT token
userSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    { 
      id: this._id, 
      email: this.email, 
      role: this.role,
      customId: this.customId 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.resetPasswordToken = resetToken;
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function () {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = verificationToken;
  this.emailVerificationTokenExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  
  return verificationToken;
};

/**
 * Enterprise RBAC: Get Effective Permissions
 * Aggregates permissions from the user's role, direct permissions, and overrides.
 */
userSchema.methods.getEffectivePermissions = async function () {
  const Role = mongoose.model('Role');
  let effectivePermissions = new Set();

  // 1. Load permissions from the RBAC Role
  if (this.rbacRole) {
    const role = await Role.findById(this.rbacRole);
    if (role && role.permissions) {
      role.permissions.forEach(p => effectivePermissions.add(p));
    }
  }

  // 2. Add direct permissions assigned to the user
  if (this.permissions && this.permissions.length > 0) {
    this.permissions.forEach(p => effectivePermissions.add(p));
  }

  // 3. Apply overrides (granted = true/false)
  if (this.permissionOverrides && this.permissionOverrides.length > 0) {
    this.permissionOverrides.forEach(override => {
      if (override.granted) {
        effectivePermissions.add(override.permission);
      } else {
        effectivePermissions.delete(override.permission);
      }
    });
  }

  return Array.from(effectivePermissions);
};

const User = mongoose.model('User', userSchema);
export default User;
