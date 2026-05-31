import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const schoolHomeSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
    heroTitle: { type: String, required: true },
    heroSubtitle: { type: String },
    heroImage: { type: cloudinaryAssetSchema },
    motto: { type: String },
    welcomeText: { type: String },
    featuredImage: { type: cloudinaryAssetSchema }
  },
  { timestamps: true }
);

const SchoolHome = mongoose.model('SchoolHome', schoolHomeSchema);
export default SchoolHome;
