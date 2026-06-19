import mongoose from 'mongoose';

const procurementSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    type: { 
      type: String, 
      enum: ['Purchase Request', 'Purchase Order'], 
      required: true,
      index: true 
    },
    vendor: { type: String, trim: true },
    items: [{
      name: { type: String, required: true, trim: true },
      description: { type: String, trim: true },
      quantity: { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
      totalPrice: { type: Number, required: true, min: 0 }
    }],
    totalAmount: { type: Number, required: true, min: 0 },
    status: { 
      type: String, 
      enum: ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Processing', 'Delivered', 'Cancelled'], 
      default: 'Draft',
      index: true 
    },
    requestDate: { type: Date, required: true, default: Date.now },
    expectedDeliveryDate: { type: Date },
    deliveredDate: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    notes: { type: String, trim: true },
    attachments: [{ type: String }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

procurementSchema.index({ school: 1, status: 1, requestDate: -1 });

const Procurement = mongoose.model('Procurement', procurementSchema);
export default Procurement;
