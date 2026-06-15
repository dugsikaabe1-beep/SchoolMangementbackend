import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const documentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // Owner (Student/Teacher/Staff)
    title: { type: String, required: true, trim: true },
    type: { 
      type: String, 
      enum: ['Certificate', 'Transcript', 'ID Card', 'Letter', 'Result', 'Other', 'Profile Photo', 'Birth Certificate', 'CV', 'Contract', 'School Logo', 'Official Document'],
      default: 'Other'
    },
    file: { type: cloudinaryAssetSchema, required: true },
    status: { type: String, enum: ['Active', 'Expired', 'Archived'], default: 'Active' },
    expiryDate: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

documentSchema.index({ school: 1, branch: 1, type: 1 });

const Document = mongoose.model('Document', documentSchema);
export default Document;
