import mongoose from 'mongoose';

const libraryBookSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    isbn: { type: String, trim: true },
    publisher: { type: String },
    category: { type: String, trim: true },
    quantity: { type: Number, default: 1, min: 0 },
    availableQuantity: { type: Number, default: 1, min: 0 },
    rackNumber: { type: String },
    price: { type: Number, min: 0 },
    status: { type: String, enum: ['Available', 'Damaged', 'Lost', 'Out of Stock'], default: 'Available' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Text search index for title and author
libraryBookSchema.index({ school: 1, branch: 1, title: 'text', author: 'text' });

// Composite unique index: ISBN must be unique per school per branch
libraryBookSchema.index({ school: 1, branch: 1, isbn: 1 }, { unique: true, sparse: true });

const LibraryBook = mongoose.model('LibraryBook', libraryBookSchema);
export default LibraryBook;
