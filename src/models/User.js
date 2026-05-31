import mongoose from 'mongoose';
import bcrypt from 'bcryptjs'
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

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
    customId: { type: String, unique: true, sparse: true }, // For Student ID or Teacher ID
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
    
    // Profile Information
    profileImage: { type: cloudinaryAssetSchema },
    phone: { 
      type: String, 
      trim: true,
      match: [/^[0-9+]*$/, 'Phone number can only contain digits and +']
    },
    
    // School Information
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' }, // Only for students
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }], // For teachers
    
    // Academic Information
    status: { 
      type: String, 
      enum: ['active', 'inactive', 'suspended', 'graduated'], 
      default: 'active' 
    },
    
    // Parent Information (for students)
    parentName: { type: String, trim: true },
    parentPhone: { type: String, trim: true },
    
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
    
    // System Information
    lastLogin: { type: Date },
    
    // Security
    resetPasswordToken: String,
    resetPasswordExpire: Date,

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
    ]
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

// Indexes for better performance
userSchema.index({ role: 1 });
userSchema.index({ school: 1 });
userSchema.index({ class: 1 });
userSchema.index({ status: 1 });
userSchema.index({ school: 1, email: 1 });

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
  const jwt = require('jsonwebtoken');
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
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.resetPasswordToken = resetToken;
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

const User = mongoose.model('User', userSchema);
export default User;
