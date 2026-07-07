import mongoose from 'mongoose';

const libraryIssueSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryBook', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // Borrower
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    returnDate: { type: Date },
    fineAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['Issued', 'Returned', 'Overdue', 'Lost'], default: 'Issued' },
    remarks: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

libraryIssueSchema.index({ school: 1, branch: 1, status: 1 });

const LibraryIssue = mongoose.model('LibraryIssue', libraryIssueSchema);
export default LibraryIssue;
