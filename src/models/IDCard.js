import mongoose from 'mongoose';
import crypto from 'crypto';

const idCardSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['student', 'teacher', 'staff'], required: true, default: 'student' },
    
    // Card Identification
    cardNumber: { type: String, unique: true, required: true, index: true },
    admissionNumber: { type: String, index: true },
    rollNumber: { type: String },
    employeeId: { type: String },
    
    // Verification
    verificationToken: { type: String, unique: true, required: true, index: true },
    verificationUrl: { type: String },
    qrCodeUrl: { type: String },
    qrCodeData: { type: mongoose.Schema.Types.Mixed }, // Stores complete QR data
    
    // Validity
    issueDate: { type: Date, default: Date.now, required: true },
    expiryDate: { type: Date },
    validFrom: { type: Date, default: Date.now },
    
    // Status
    status: { type: String, enum: ['active', 'inactive', 'expired', 'suspended', 'graduated'], default: 'active' },
    statusReason: { type: String },
    
    // Design & Printing
    design: { type: mongoose.Schema.Types.ObjectId, ref: 'IDCardDesign' },
    printed: { type: Boolean, default: false },
    printedAt: { type: Date },
    printedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    printCount: { type: Number, default: 0 },
    
    // Snapshot of user data at card creation time
    userSnapshot: {
      name: { type: String },
      customId: { type: String },
      email: { type: String },
      phone: { type: String },
      photo: { type: mongoose.Schema.Types.Mixed },
      class: { type: mongoose.Schema.Types.Mixed },
      section: { type: String },
      branch: { type: mongoose.Schema.Types.Mixed },
      role: { type: String },
      address: { type: String },
      bloodGroup: { type: String },
      emergencyContact: { type: String },
      dateOfBirth: { type: Date },
    },
    
    // School snapshot
    schoolSnapshot: {
      name: { type: String },
      logo: { type: mongoose.Schema.Types.Mixed },
      address: { type: String },
      phone: { type: String },
      email: { type: String },
      website: { type: String },
      signature: { type: mongoose.Schema.Types.Mixed },
      stamp: { type: mongoose.Schema.Types.Mixed },
    },
    
    // Metadata
    notes: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Pre-save hook to generate cardNumber and verificationToken if not provided
idCardSchema.pre('save', async function() {
  if (!this.cardNumber) {
    // Format: SCHOOL-YEAR-XXXXXX (customizable via school settings)
    const year = new Date().getFullYear();
    const random = Math.floor(100000 + Math.random() * 900000);
    this.cardNumber = `ID-${year}-${random}`;
  }

  if (!this.verificationToken) {
    this.verificationToken = crypto.randomBytes(32).toString('hex');
  }

  if (!this.expiryDate) {
    // Default expiry: 1 year from issue
    const expiry = new Date(this.issueDate);
    expiry.setFullYear(expiry.getFullYear() + 1);
    this.expiryDate = expiry;
  }
  
  // Auto-check expiry
  const now = new Date();
  if (this.expiryDate && now > this.expiryDate && this.status === 'active') {
    this.status = 'expired';
  }
});

// Generate QR data
idCardSchema.methods.generateQrData = function(school) {
  const qrData = {
    cardNumber: this.cardNumber,
    verificationToken: this.verificationToken,
    userId: this.user.toString(),
    schoolId: this.school.toString(),
    tenantId: this.school.toString(), // Alias for tenant
    branchId: this.branch ? this.branch.toString() : null,
    type: this.type,
    status: this.status,
    issueDate: this.issueDate.toISOString(),
    expiryDate: this.expiryDate ? this.expiryDate.toISOString() : null,
    generatedAt: new Date().toISOString(),
    verificationUrl: this.verificationUrl || (school?.settings?.idCard?.verificationBaseUrl ? `${school.settings.idCard.verificationBaseUrl}/verify/${this.verificationToken}` : null),
    name: this.userSnapshot?.name,
    motherName: this.userSnapshot?.motherName,
    grade: this.userSnapshot?.class?.name || this.userSnapshot?.class,
    image: this.userSnapshot?.photo?.url || this.userSnapshot?.photo
  };
  
  this.qrCodeData = qrData;
  return qrData;
};

// Indexes for performance
idCardSchema.index({ school: 1, user: 1 });
idCardSchema.index({ school: 1, status: 1 });
idCardSchema.index({ school: 1, type: 1 });
idCardSchema.index({ verificationToken: 1 });
idCardSchema.index({ cardNumber: 1 });
idCardSchema.index({ school: 1, createdAt: -1 });

const IDCard = mongoose.model('IDCard', idCardSchema);
export default IDCard;
