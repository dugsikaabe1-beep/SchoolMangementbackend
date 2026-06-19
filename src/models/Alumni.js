import mongoose from 'mongoose';

const alumniSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    originalStudent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Reference to former student
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    graduationYear: { type: Number, required: true, index: true },
    university: { type: String, trim: true },
    course: { type: String, trim: true },
    currentJob: { type: String, trim: true },
    currentCompany: { type: String, trim: true },
    currentLocation: { type: String, trim: true },
    achievements: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    notes: { type: String, trim: true },
    socialLinks: {
      linkedin: { type: String, trim: true },
      facebook: { type: String, trim: true },
      twitter: { type: String, trim: true },
      instagram: { type: String, trim: true },
      other: { type: String, trim: true }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

alumniSchema.index({ school: 1, graduationYear: -1 });
alumniSchema.index({ school: 1, lastName: 1 });

const Alumni = mongoose.model('Alumni', alumniSchema);
export default Alumni;
