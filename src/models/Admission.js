import mongoose from 'mongoose';

const admissionSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    studentName: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    parentName: { type: String, required: true },
    parentPhone: { type: String, required: true },
    address: { type: String },
    previousSchool: { type: String },
    documents: [{
      name: String,
      url: String
    }],
    status: {
      type: String,
      enum: ['pending', 'under_review', 'approved', 'rejected'],
      default: 'pending'
    },
    reviewNotes: { type: String },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    applicationNumber: { type: String, unique: true },
  },
  { timestamps: true }
);

const Admission = mongoose.model('Admission', admissionSchema);
export default Admission;
