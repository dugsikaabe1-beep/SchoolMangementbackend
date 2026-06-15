import mongoose from 'mongoose';

const systemAnnouncementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['update', 'maintenance', 'feature', 'security', 'reminder', 'announcement'], 
      default: 'announcement' 
    },
    targetAudience: { 
      type: String, 
      enum: ['all', 'specific_schools', 'specific_plans', 'trial_users', 'expiring_schools'], 
      default: 'all' 
    },
    targetSchools: [{ type: mongoose.Schema.Types.ObjectId, ref: 'School' }],
    targetPlans: [{ type: String }], // Plan codes
    releaseNotes: { type: String },
    tutorialLink: { type: String },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date },
    expiresAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const SystemAnnouncement = mongoose.model('SystemAnnouncement', systemAnnouncementSchema);
export default SystemAnnouncement;
