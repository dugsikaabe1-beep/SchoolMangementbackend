import mongoose from 'mongoose';

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g., Grade 10
    section: { type: String, required: true }, // e.g., A, B, C
    maxStudents: { type: Number, required: true, min: 1 },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    classTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Prevent duplicate class+section within the same school
classSchema.index({ school: 1, name: 1, section: 1 }, { unique: true });

const Class = mongoose.model('Class', classSchema);
export default Class;
