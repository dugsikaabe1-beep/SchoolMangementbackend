import mongoose from 'mongoose';
import { cloudinaryAssetSchema } from './schemas/cloudinaryAssetSchema.js';

const idCardDesignSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    type: { type: String, enum: ['student', 'teacher'], required: true },
    layout: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },
    backgroundColor: { type: String, default: '#ffffff' },
    textColor: { type: String, default: '#000000' },
    showQrCode: { type: Boolean, default: true },
    showBarcode: { type: Boolean, default: false },
    fields: [{ type: String }], // e.g. ['name', 'id', 'class', 'phone']
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const IDCardDesign = mongoose.model('IDCardDesign', idCardDesignSchema);
export default IDCardDesign;
