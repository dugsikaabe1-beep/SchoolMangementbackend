import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const schoolEventSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    location: { type: String },
    image: { type: cloudinaryAssetSchema },
    type: { 
      type: String, 
      enum: ['academic', 'sports', 'cultural', 'holiday', 'other'], 
      default: 'other' 
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Index for multi-tenant and multi-branch queries
schoolEventSchema.index({ school: 1, branch: 1, date: -1 });

const SchoolEvent = mongoose.model('SchoolEvent', schoolEventSchema);
export default SchoolEvent;
