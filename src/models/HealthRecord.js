import mongoose from 'mongoose';

const healthRecordSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bloodGroup: { 
      type: String, 
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'], 
      default: 'Unknown' 
    },
    allergies: [{ type: String, trim: true }],
    medications: [{ type: String, trim: true }],
    medicalConditions: [{ type: String, trim: true }],
    emergencyContacts: [{ 
      name: { type: String, required: true, trim: true },
      relationship: { type: String, trim: true },
      phone: { type: String, required: true },
      email: { type: String, trim: true }
    }],
    lastCheckupDate: { type: Date },
    notes: { type: String, trim: true },
    attachments: [{ type: String }],
    isConfidential: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

healthRecordSchema.index({ school: 1, student: 1 });

const HealthRecord = mongoose.model('HealthRecord', healthRecordSchema);
export default HealthRecord;
