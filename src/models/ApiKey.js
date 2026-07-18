import mongoose from 'mongoose';

const apiKeySchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name:         { type: String, required: true, trim: true },
    key:          { type: String, required: true, unique: true },
    prefix:       { type: String, required: true },
    permissions:  [{ type: String }],
    rateLimit:    { type: Number, default: 1000 },
    expiresAt:    { type: Date },
    lastUsedAt:   { type: Date },
    usageCount:   { type: Number, default: 0 },
    ipWhitelist:  [{ type: String }],
    status:       { type: String, enum: ['active', 'revoked', 'expired'], default: 'active', index: true },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

apiKeySchema.index({ school: 1, key: 1 }, { unique: true });

const ApiKey = mongoose.model('ApiKey', apiKeySchema);
export default ApiKey;
