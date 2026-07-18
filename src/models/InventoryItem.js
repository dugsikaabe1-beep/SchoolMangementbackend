import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    name:         { type: String, required: true, trim: true },
    code:         { type: String, trim: true },
    category:     { type: String, enum: ['stationery', 'furniture', 'technology', 'lab_equipment', 'sports', 'maintenance', 'uniform', 'food', 'other'], required: true, index: true },
    description:  { type: String, trim: true },
    unit:         { type: String, enum: ['piece', 'box', 'pack', 'kg', 'liter', 'meter', 'set'], default: 'piece' },
    quantity:     { type: Number, default: 0, min: 0 },
    minStock:     { type: Number, default: 0 },
    maxStock:     { type: Number, default: 0 },
    unitPrice:    { type: Number, default: 0, min: 0 },
    supplier:     { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    location:     { type: String, trim: true },
    status:       { type: String, enum: ['in_stock', 'low_stock', 'out_of_stock', 'discontinued'], default: 'in_stock', index: true },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

inventoryItemSchema.index({ school: 1, code: 1 }, { unique: true, sparse: true });
inventoryItemSchema.index({ school: 1, category: 1 });

const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema);
export default InventoryItem;
