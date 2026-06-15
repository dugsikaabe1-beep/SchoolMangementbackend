import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const schoolAboutSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    history: { type: String },
    mission: { type: String },
    vision: { type: String },
    values: [{ type: String }],
    principalMessage: { type: String },
    principalImage: { type: cloudinaryAssetSchema },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// One "About" page per branch per school
schoolAboutSchema.index({ school: 1, branch: 1 }, { unique: true });

const SchoolAbout = mongoose.model('SchoolAbout', schoolAboutSchema);
export default SchoolAbout;
