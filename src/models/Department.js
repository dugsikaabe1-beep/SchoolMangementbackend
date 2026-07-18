import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    name:        { type: String, required: true, trim: true },
    code:        { type: String, trim: true },
    description: { type: String, trim: true },
    head:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
    isDeleted:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

departmentSchema.index({ school: 1, name: 1 }, { unique: true, sparse: true });
departmentSchema.index({ school: 1, branch: 1 });

const Department = mongoose.model('Department', departmentSchema);
export default Department;
