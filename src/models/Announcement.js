import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const announcementSchema = new mongoose.Schema(
  {
    title: { 
      type: String, 
      required: [true, 'Title is required'], 
      trim: true,
      maxlength: [200, 'Title must be less than 200 characters']
    },
    content: { 
      type: String, 
      required: [true, 'Content is required'], 
      trim: true 
    },
    audience: { 
      type: String, 
      enum: ['all', 'students', 'teachers', 'class'], 
      default: 'all' 
    },
    // If audience is 'class', specify which class
    targetClass: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Class' 
    },
    priority: { 
      type: String, 
      enum: ['low', 'normal', 'high', 'urgent'], 
      default: 'normal' 
    },
    status: { 
      type: String, 
      enum: ['draft', 'published', 'archived'], 
      default: 'published' 
    },
    school: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'School', 
      required: true 
    },
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    expiresAt: { type: Date },
    media: { type: cloudinaryAssetSchema },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index for efficient queries
announcementSchema.index({ school: 1, status: 1, createdAt: -1 });
announcementSchema.index({ school: 1, audience: 1 });

const Announcement = mongoose.model('Announcement', announcementSchema);
export default Announcement;
