import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    item:         { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
    type:         { type: String, enum: ['in', 'out', 'adjustment', 'transfer', 'return'], required: true, index: true },
    quantity:     { type: Number, required: true },
    unitPrice:    { type: Number, default: 0 },
    totalValue:   { type: Number, default: 0 },
    reference:    { type: String, trim: true },
    department:   { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    issuedTo:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    supplier:     { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    date:         { type: Date, default: Date.now, index: true },
    notes:        { type: String, trim: true },
    approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

stockMovementSchema.index({ school: 1, item: 1, date: -1 });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
export default StockMovement;
