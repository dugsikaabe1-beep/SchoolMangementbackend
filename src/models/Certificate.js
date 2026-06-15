import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const certificateSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    type: {
      type: String,
      enum: ['report_card', 'completion', 'graduation', 'achievement'],
      required: true
    },
    title: { type: String, required: true },
    issueDate: { type: Date, default: Date.now },
    verificationNumber: { type: String, unique: true, required: true },
    content: { type: mongoose.Schema.Types.Mixed }, // Specific data for the certificate
    pdfUrl: { type: String },
    isPublished: { type: Boolean, default: false },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const Certificate = mongoose.model('Certificate', certificateSchema);
export default Certificate;
