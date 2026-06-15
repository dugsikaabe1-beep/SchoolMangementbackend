import mongoose from 'mongoose';

const schoolFeatureOverrideSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    featureKey: { type: String, required: true, index: true },
    isEnabled: { type: Boolean, required: true },
    enabledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

// Compound index to ensure unique feature per school
schoolFeatureOverrideSchema.index({ school: 1, featureKey: 1 }, { unique: true });

const SchoolFeatureOverride = mongoose.model('SchoolFeatureOverride', schoolFeatureOverrideSchema);
export default SchoolFeatureOverride;
