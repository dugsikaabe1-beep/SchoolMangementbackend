import mongoose from 'mongoose';

/**
 * EmployeeBiometric — Central biometric enrollment record for an employee.
 *
 * ONE document per employee per school. Stores all registered biometric
 * credentials: RFID card UIDs, NFC tags, face embeddings, fingerprint templates.
 * Used by the attendance engine for automatic identity recognition.
 */
const employeeBiometricSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    school:   { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:   { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

    // ── RFID Card ──────────────────────────────────────────────────
    rfid: {
      uid:          { type: String },
      cardNumber:   { type: String },
      status:       { type: String, enum: ['active', 'inactive', 'lost', 'replaced'], default: 'active' },
      device:       { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricDevice' },
      enrolledAt:   { type: Date },
      enrolledBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      previousUids: [{ type: String }],
    },

    // ── NFC Tag ────────────────────────────────────────────────────
    nfc: {
      uid:          { type: String },
      status:       { type: String, enum: ['active', 'inactive', 'lost', 'replaced'], default: 'active' },
      device:       { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricDevice' },
      enrolledAt:   { type: Date },
      enrolledBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      previousUids: [{ type: String }],
    },

    // ── Face Recognition ───────────────────────────────────────────
    face: {
      embeddings:    [{ type: Number }],
      templateCount: { type: Number, default: 0 },
      device:        { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricDevice' },
      status:        { type: String, enum: ['active', 'inactive', 'replaced'], default: 'active' },
      enrolledAt:    { type: Date },
      enrolledBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      livenessScore: { type: Number },
    },

    // ── Fingerprint ────────────────────────────────────────────────
    fingerprint: {
      templates: [{
        fingerIndex: { type: Number, required: true },
        fingerName:  { type: String },
        templateRef: { type: String },
        quality:     { type: Number },
        status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
        enrolledAt:  { type: Date },
      }],
      status:     { type: String, enum: ['active', 'inactive'], default: 'active' },
      device:     { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricDevice' },
      enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    // ── Enrollment Summary ─────────────────────────────────────────
    enrolledMethods: [{ type: String, enum: ['RFID', 'NFC', 'FACE', 'FINGERPRINT'] }],
    lastUpdated:     { type: Date },
    updatedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

employeeBiometricSchema.index({ employee: 1, school: 1 }, { unique: true });
employeeBiometricSchema.index({ 'rfid.uid': 1 });
employeeBiometricSchema.index({ 'nfc.uid': 1 });

const EmployeeBiometric = mongoose.model('EmployeeBiometric', employeeBiometricSchema);
export default EmployeeBiometric;
