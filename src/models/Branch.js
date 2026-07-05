import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const branchSchema = new mongoose.Schema(
  {
    tenant: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'School', 
      required: true,
      index: true 
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
    principalName: { type: String, trim: true },
    logo: { type: cloudinaryAssetSchema },
    
    // Login Credentials (for direct branch login)
    loginEmail: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    password: { type: String },
    otp: { type: String },
    otpExpires: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    
    // RBAC: Role reference for branch-specific permissions
    rbacRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role'
    },

    isMain: { type: Boolean, default: false }, // Mark as Main Branch

    status: { 
      type: String, 
      enum: ['active', 'inactive', 'archived'], 
      default: 'active' 
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index for multi-tenant and multi-branch queries
branchSchema.index({ tenant: 1, status: 1 });

// Password hashing
branchSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Password comparison
branchSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const Branch = mongoose.model('Branch', branchSchema);
export default Branch;
