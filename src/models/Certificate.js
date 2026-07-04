import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';
import crypto from 'crypto';

const certificateSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    type: {
      type: String,
      enum: [
        'report_card',
        'completion',
        'graduation',
        'transfer',
        'character',
        'achievement',
        'bonafide'
      ],
      required: true
    },
    title: { type: String, required: true },
    description: { type: String },
    
    // Certificate Number
    certificateNumber: { type: String, unique: true, required: true, index: true },
    verificationToken: { type: String, unique: true, required: true, index: true },
    verificationUrl: { type: String },
    
    // Issue & Validity
    issueDate: { type: Date, default: Date.now },
    validFrom: { type: Date },
    validUntil: { type: Date },
    
    // Student Snapshot (preserves data at time of issue)
    studentSnapshot: {
      name: { type: String },
      customId: { type: String },
      photo: { type: mongoose.Schema.Types.Mixed },
      class: { type: mongoose.Schema.Types.Mixed },
      section: { type: String },
      rollNumber: { type: String },
      admissionNumber: { type: String },
      dateOfBirth: { type: Date },
      address: { type: String },
      parentName: { type: String }
    },
    
    // School Snapshot
    schoolSnapshot: {
      name: { type: String },
      logo: { type: mongoose.Schema.Types.Mixed },
      address: { type: String },
      email: { type: String },
      phone: { type: String },
      website: { type: String },
      principalName: { type: String },
      principalSignature: { type: mongoose.Schema.Types.Mixed },
      schoolStamp: { type: mongoose.Schema.Types.Mixed }
    },
    
    // Branch Snapshot
    branchSnapshot: {
      name: { type: String },
      address: { type: String }
    },
    
    // Content by Type
    content: { type: mongoose.Schema.Types.Mixed },
    
    // Report Card Specific
    reportCard: {
      term: { type: String },
      academicYearName: { type: String },
      overallGrade: { type: String },
      percentage: { type: Number },
      position: { type: Number },
      totalStudents: { type: Number },
      attendancePercentage: { type: Number },
      remarks: { type: String },
      subjects: [
        {
          name: { type: String },
          teacher: { type: String },
          maxMarks: { type: Number },
          marksObtained: { type: Number },
          grade: { type: String },
          remarks: { type: String }
        }
      ]
    },
    
    // Graduation Specific
    graduation: {
      program: { type: String },
      specialization: { type: String },
      graduationDate: { type: Date },
      division: { type: String },
      honors: { type: String }
    },
    
    // Transfer Specific
    transfer: {
      dateOfLeaving: { type: Date },
      reason: { type: String },
      lastClass: { type: String },
      lastAcademicYear: { type: String },
      feeStatus: { type: String, enum: ['clear', 'pending'] },
      conduct: { type: String }
    },
    
    // Character Specific
    character: {
      periodFrom: { type: Date },
      periodTo: { type: Date },
      conduct: { type: String },
      discipline: { type: String },
      characterDescription: { type: String }
    },
    
    // Achievement Specific
    achievement: {
      achievementTitle: { type: String },
      achievementDescription: { type: String },
      dateOfAchievement: { type: Date },
      category: { type: String },
      level: { type: String }, // school, district, state, national, international
      position: { type: String }
    },
    
    // Bonafide Specific
    bonafide: {
      purpose: { type: String }, // passport, visa, scholarship, bank loan, etc.
      durationFrom: { type: Date },
      durationTo: { type: Date }
    },
    
    // Files
    pdfUrl: { type: String },
    qrCodeImage: { type: cloudinaryAssetSchema },
    
    // Status
    isPublished: { type: Boolean, default: false },
    isRevoked: { type: Boolean, default: false },
    revocationReason: { type: String },
    revokedAt: { type: Date },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // Issuer
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // Template used
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'CertificateTemplate' },
    
    // Downloads & Views
    downloadCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    lastDownloadedAt: { type: Date }
  },
  { timestamps: true }
);

// Pre-save hook
certificateSchema.pre('save', function (next) {
  if (!this.verificationToken) {
    this.verificationToken = crypto.randomBytes(32).toString('hex');
  }
  
  if (!this.certificateNumber) {
    const year = new Date().getFullYear();
    const random = Math.floor(100000 + Math.random() * 900000);
    this.certificateNumber = `CERT-${year}-${random}`;
  }
  
  next();
});

// Generate QR Data
certificateSchema.methods.generateQRData = function (school) {
  const qrData = {
    certificateNumber: this.certificateNumber,
    verificationToken: this.verificationToken,
    studentId: this.student.toString(),
    schoolId: this.school.toString(),
    branchId: this.branch ? this.branch.toString() : null,
    type: this.type,
    title: this.title,
    isRevoked: this.isRevoked,
    issueDate: this.issueDate.toISOString(),
    generatedAt: new Date().toISOString(),
    verificationUrl: this.verificationUrl || 
      (school?.settings?.idCard?.verificationBaseUrl 
        ? `${school.settings.idCard.verificationBaseUrl}/verify-certificate/${this.verificationToken}`
        : null)
  };
  
  return qrData;
};

// Indexes
certificateSchema.index({ school: 1, student: 1 });
certificateSchema.index({ school: 1, type: 1 });
certificateSchema.index({ school: 1, academicYear: 1 });
certificateSchema.index({ certificateNumber: 1 });

const Certificate = mongoose.model('Certificate', certificateSchema);
export default Certificate;
