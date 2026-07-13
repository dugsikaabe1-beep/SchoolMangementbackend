import mongoose from 'mongoose';

const qrCodeTokenSchema = new mongoose.Schema(
  {
    hash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    type: {
      type: String,
      enum: ['SESSION', 'PERSONAL', 'CHECK_IN', 'CHECK_OUT'],
      default: 'SESSION'
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class'
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject'
    },
    date: {
      type: Date,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }
    },
    usedBy: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      usedAt: { type: Date, default: Date.now },
      attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' }
    }],
    isRevoked: {
      type: Boolean,
      default: false
    },
    revokedAt: Date,
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    maxUses: {
      type: Number,
      default: 0
    },
    usageCount: {
      type: Number,
      default: 0
    },
    personalUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    encryptedData: {
      type: String
    },
    nonce: {
      type: String,
      required: true
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true
    },
    academicYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

qrCodeTokenSchema.index({ school: 1, branch: 1, date: 1 });
qrCodeTokenSchema.index({ school: 1, branch: 1, isRevoked: 1 });
qrCodeTokenSchema.index({ school: 1, createdBy: 1 });
qrCodeTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const QrCodeToken = mongoose.model('QrCodeToken', qrCodeTokenSchema);
export default QrCodeToken;
