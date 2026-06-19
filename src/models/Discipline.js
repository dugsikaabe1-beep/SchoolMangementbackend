import mongoose from 'mongoose';

const disciplineSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    academicYear: { type: String, required: true, index: true },
    type: { 
      type: String, 
      enum: ['Warning', 'Minor Offense', 'Major Offense', 'Suspension', 'Expulsion'],
      required: true 
    },
    date: { type: Date, required: true, default: Date.now },
    description: { type: String, required: true, trim: true },
    actionTaken: { type: String, trim: true },
    severity: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    witnesses: [{ type: String }],
    attachments: [{ type: String }],
    status: { type: String, enum: ['Pending', 'Resolved', 'Closed'], default: 'Pending' },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

disciplineSchema.index({ school: 1, student: 1, date: -1 });

const Discipline = mongoose.model('Discipline', disciplineSchema);
export default Discipline;
