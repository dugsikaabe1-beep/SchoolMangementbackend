import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const idCardDesignSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    type: { type: String, enum: ['student', 'teacher', 'staff'], required: true },
    name: { type: String, required: true, trim: true },
    
    // Layout
    layout: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },
    size: { type: String, enum: ['cr80', 'cr79', 'custom'], default: 'cr80' },
    
    // Colors
    primaryColor: { type: String, default: '#4f46e5' },
    secondaryColor: { type: String, default: '#7c3aed' },
    backgroundColor: { type: String, default: '#ffffff' },
    textColor: { type: String, default: '#000000' },
    accentColor: { type: String, default: '#4f46e5' },
    
    // Background
    backgroundImage: { type: cloudinaryAssetSchema },
    backgroundOpacity: { type: Number, default: 0.1, min: 0, max: 1 },
    
    // QR & Barcode
    showQrCode: { type: Boolean, default: true },
    qrPosition: { type: String, enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], default: 'bottom-right' },
    qrSize: { type: Number, default: 40, min: 20, max: 80 },
    showBarcode: { type: Boolean, default: false },
    barcodePosition: { type: String, enum: ['top', 'bottom'], default: 'bottom' },
    barcodeFormat: { type: String, enum: ['code128', 'code39', 'ean13'], default: 'code128' },
    
    // Header & Footer
    headerText: { type: String, default: '' },
    footerText: { type: String, default: '' },
    showSchoolLogo: { type: Boolean, default: true },
    showSchoolStamp: { type: Boolean, default: false },
    showPrincipalSignature: { type: Boolean, default: true },
    
    // Front Side Fields
    frontFields: [
      {
        name: { type: String, required: true },
        label: { type: String },
        showLabel: { type: Boolean, default: true },
        position: { type: Number, required: true },
        isRequired: { type: Boolean, default: false },
        fontSize: { type: Number, default: 12 },
        fontWeight: { type: String, enum: ['normal', 'medium', 'bold'], default: 'normal' }
      }
    ],
    
    // Back Side Fields
    backFields: [
      {
        name: { type: String, required: true },
        label: { type: String },
        showLabel: { type: Boolean, default: true },
        position: { type: Number, required: true },
        isRequired: { type: Boolean, default: false },
        fontSize: { type: Number, default: 11 },
        fontWeight: { type: String, enum: ['normal', 'medium', 'bold'], default: 'normal' }
      }
    ],
    
    // Default fields
    defaultFrontFields: { type: [String], default: ['photo', 'name', 'idNumber', 'class', 'branch', 'rollNumber'] },
    defaultBackFields: { type: [String], default: ['address', 'phone', 'bloodGroup', 'emergencyContact', 'termsAndConditions', 'schoolContact'] },
    
    // Terms & Conditions
    termsAndConditions: { type: String, default: 'This card is the property of the school. If found, please return to the school office.' },
    
    // Status
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

idCardDesignSchema.index({ school: 1, type: 1 });
idCardDesignSchema.index({ school: 1, isDefault: 1 });

const IDCardDesign = mongoose.model('IDCardDesign', idCardDesignSchema);
export default IDCardDesign;
