import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const schoolHomeSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    heroTitle: { type: String, required: true },
    heroSubtitle: { type: String },
    heroImage: { type: cloudinaryAssetSchema },
    motto: { type: String },
    welcomeText: { type: String },
    featuredImage: { type: cloudinaryAssetSchema },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// One home page configuration per branch per school
schoolHomeSchema.index({ school: 1, branch: 1 }, { unique: true });

const SchoolHome = mongoose.model('SchoolHome', schoolHomeSchema);
export default SchoolHome;
