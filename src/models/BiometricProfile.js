import mongoose from 'mongoose';

/**
 * BiometricProfile — Centralised biometric enrollment record for an employee.
 *
 * Separate from User.verificationData (which holds lightweight flags/templates
 * for fast lookup). This model stores the full enrollment audit trail:
 * which device captured the template, when, how many samples, and the
 * device-specific reference ID needed to push/pull templates to hardware.
 */
const biometricProfileSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    school:   { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:   { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

    // ── RFID ──────────────────────────────────────────────────────────
    rfid: {
      uid:          { type: String },          // card UID
      cardNumber:   { type: String },          // human-readable card #
      status:       { type: String, enum: ['active', 'inactive', 'lost', 'replaced'], default: 'active' },
      device:       { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDevice' },
      enrolledAt:   { type: Date },
      enrolledBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      previousUids: [{ type: String }],        // history of replaced cards
    },

    // ── NFC ───────────────────────────────────────────────────────────
    nfc: {
      uid:          { type: String },
      status:       { type: String, enum: ['active', 'inactive', 'lost', 'replaced'], default: 'active' },
      device:       { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDevice' },
      enrolledAt:   { type: Date },
      enrolledBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      previousUids: [{ type: String }],
    },

    // ── Face Recognition ──────────────────────────────────────────────
    face: {
      embeddings:    [{ type: Number }],       // flat float array (128 / 512-d)
      templateCount: { type: Number, default: 0 },
      device:        { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDevice' },
      status:        { type: String, enum: ['active', 'inactive', 'replaced'], default: 'active' },
      enrolledAt:    { type: Date },
      enrolledBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      livenessScore: { type: Number },         // last liveness check score
    },

    // ── Fingerprint ───────────────────────────────────────────────────
    fingerprint: {
      templates: [{
        fingerIndex: { type: Number, required: true }, // 0-9 (right thumb=0 … left pinky=9)
        fingerName:  { type: String },                  // e.g. "Right Thumb"
        templateRef: { type: String },                  // device-specific template ID
        quality:     { type: Number },                  // 0-100
        status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
        enrolledAt:  { type: Date },
      }],
      status:     { type: String, enum: ['active', 'inactive'], default: 'active' },
      device:     { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDevice' },
      enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    // ── QR Code ───────────────────────────────────────────────────────
    qr: {
      code:         { type: String },           // encrypted payload
      token:        { type: String },           // security token
      expiresAt:    { type: Date },
      status:       { type: String, enum: ['active', 'inactive', 'revoked'], default: 'active' },
      generatedAt:  { type: Date },
      generatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    // ── Enrollment Summary ────────────────────────────────────────────
    enrolledMethods: [{ type: String, enum: ['RFID', 'NFC', 'FACE', 'FINGERPRINT', 'QR'] }],
    lastUpdated:     { type: Date },
    updatedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

biometricProfileSchema.index({ employee: 1, school: 1 }, { unique: true });
biometricProfileSchema.index({ 'rfid.uid': 1 });
biometricProfileSchema.index({ 'nfc.uid': 1 });

const BiometricProfile = mongoose.model('BiometricProfile', biometricProfileSchema);
export default BiometricProfile;
