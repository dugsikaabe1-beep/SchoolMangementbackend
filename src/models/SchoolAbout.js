import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const schoolAboutSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
    history: { type: String },
    mission: { type: String },
    vision: { type: String },
    values: [{ type: String }],
    principalMessage: { type: String },
    principalImage: { type: cloudinaryAssetSchema }
  },
  { timestamps: true }
);

const SchoolAbout = mongoose.model('SchoolAbout', schoolAboutSchema);
export default SchoolAbout;
