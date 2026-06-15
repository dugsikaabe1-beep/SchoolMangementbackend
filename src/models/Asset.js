import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    name: { type: String, required: true },
    category: { 
      type: String, 
      enum: ['electronics', 'furniture', 'vehicle', 'stationary', 'other'], 
      required: true 
    },
    quantity: { type: Number, default: 1 },
    location: { type: String },
    status: { 
      type: String, 
      enum: ['available', 'assigned', 'maintenance', 'damaged', 'disposed'], 
      default: 'available' 
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    purchaseDate: { type: Date },
    cost: { type: Number },
    serialNumber: { type: String }
  },
  { timestamps: true }
);

// Composite unique index: serialNumber must be unique per school per branch
assetSchema.index({ school: 1, branch: 1, serialNumber: 1 }, { unique: true, sparse: true });

const Asset = mongoose.model('Asset', assetSchema);
export default Asset;
