import mongoose from 'mongoose';

const streamSchema = new mongoose.Schema(
  {
    tenant: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'School', 
      required: true,
      index: true 
    },
    branch: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Branch', 
      default: null,
      index: true 
    },
    name: { type: String, required: true, trim: true }, // e.g., "Science", "Commerce", "Arts"
    code: { type: String, trim: true }, // e.g., "SCI", "COM", "ART"
    description: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

streamSchema.index({ tenant: 1, branch: 1 });

const Stream = mongoose.model('Stream', streamSchema);
export default Stream;
