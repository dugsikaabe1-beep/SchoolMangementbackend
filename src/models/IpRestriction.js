import mongoose from 'mongoose';

const ipRestrictionSchema = new mongoose.Schema(
  {
    school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name:        { type: String, required: true, trim: true },
    ipAddress:   { type: String, required: true },
    cidr:        { type: String },
    type:        { type: String, enum: ['allow', 'deny'], default: 'allow' },
    description: { type: String, trim: true },
    isActive:    { type: Boolean, default: true },
    isDeleted:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

ipRestrictionSchema.index({ school: 1, ipAddress: 1 });

const IpRestriction = mongoose.model('IpRestriction', ipRestrictionSchema);
export default IpRestriction;
