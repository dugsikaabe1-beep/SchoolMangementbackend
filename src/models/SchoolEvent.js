import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const schoolEventSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    location: { type: String },
    image: { type: cloudinaryAssetSchema },
    type: { 
      type: String, 
      enum: ['academic', 'sports', 'cultural', 'holiday', 'other'], 
      default: 'other' 
    }
  },
  { timestamps: true }
);

const SchoolEvent = mongoose.model('SchoolEvent', schoolEventSchema);
export default SchoolEvent;
