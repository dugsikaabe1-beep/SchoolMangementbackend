import mongoose from 'mongoose';

const passwordPolicySchema = new mongoose.Schema(
  {
    school:               { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    minLength:            { type: Number, default: 8 },
    requireUppercase:     { type: Boolean, default: true },
    requireLowercase:     { type: Boolean, default: true },
    requireNumbers:       { type: Boolean, default: true },
    requireSpecialChars:  { type: Boolean, default: true },
    maxAge:               { type: Number, default: 90 },
    preventReuse:         { type: Number, default: 5 },
    lockoutAttempts:      { type: Number, default: 5 },
    lockoutDuration:      { type: Number, default: 30 },
    enforceForAdmins:     { type: Boolean, default: true },
    enforceForTeachers:   { type: Boolean, default: true },
    enforceForStudents:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

const PasswordPolicy = mongoose.model('PasswordPolicy', passwordPolicySchema);
export default PasswordPolicy;
