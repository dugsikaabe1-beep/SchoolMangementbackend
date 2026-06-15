import mongoose from 'mongoose';

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g., Grade 10
    section: { type: String, required: true }, // e.g., A, B, C
    maxStudents: { type: Number, required: true, min: 1 },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    classTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Prevent duplicate class+section within the same school and branch
classSchema.index({ school: 1, branch: 1, name: 1, section: 1 }, { unique: true });

const Class = mongoose.model('Class', classSchema);
export default Class;
