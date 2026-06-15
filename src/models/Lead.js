import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    schoolName: { type: String, trim: true },
    country: { type: String, trim: true },
    message: { type: String, trim: true },
    type: { 
      type: String, 
      enum: ['contact', 'demo', 'consultation'], 
      default: 'contact' 
    },
    status: { 
      type: String, 
      enum: ['new', 'contacted', 'demo_scheduled', 'trial_started', 'paid_customer', 'renewal', 'rejected'], 
      default: 'new' 
    },
    followUpDate: { type: Date },
    notes: [{
      content: String,
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      addedAt: { type: Date, default: Date.now }
    }],
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

const Lead = mongoose.model('Lead', leadSchema);
export default Lead;
