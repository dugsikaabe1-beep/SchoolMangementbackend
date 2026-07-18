import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    name:         { type: String, required: true, trim: true },
    contactPerson:{ type: String, trim: true },
    email:        { type: String, trim: true, lowercase: true },
    phone:        { type: String, trim: true },
    address:      { type: String, trim: true },
    category:     { type: String, enum: ['stationery', 'furniture', 'technology', 'maintenance', 'uniform', 'food', 'other'], default: 'other' },
    taxId:        { type: String, trim: true },
    paymentTerms: { type: String, trim: true },
    rating:       { type: Number, min: 1, max: 5, default: 3 },
    status:       { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active', index: true },
    bankDetails:  { bankName: String, accountNumber: String, swiftCode: String },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

supplierSchema.index({ school: 1, name: 1 });

const Supplier = mongoose.model('Supplier', supplierSchema);
export default Supplier;
