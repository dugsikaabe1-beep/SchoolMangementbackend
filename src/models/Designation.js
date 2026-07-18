import mongoose from 'mongoose';

const designationSchema = new mongoose.Schema(
  {
    school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    department:  { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    name:        { type: String, required: true, trim: true },
    code:        { type: String, trim: true },
    description: { type: String, trim: true },
    level:       { type: Number, default: 0 },
    status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
    isDeleted:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

designationSchema.index({ school: 1, name: 1 }, { unique: true, sparse: true });
designationSchema.index({ school: 1, department: 1 });

const Designation = mongoose.model('Designation', designationSchema);
export default Designation;
