import mongoose from 'mongoose';

const journalLineSchema = new mongoose.Schema(
  {
    account:      { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    debit:        { type: Number, default: 0, min: 0 },
    credit:       { type: Number, default: 0, min: 0 },
    description:  { type: String, trim: true },
  },
  { _id: false }
);

const journalEntrySchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    entryNumber:  { type: String, required: true },
    date:         { type: Date, required: true, index: true },
    reference:    { type: String, trim: true },
    description:  { type: String, required: true, trim: true },
    lines:        { type: [journalLineSchema], required: true, validate: v => v.length >= 2 },
    totalDebit:   { type: Number, required: true },
    totalCredit:  { type: Number, required: true },
    source:       { type: String, enum: ['manual', 'payment', 'expense', 'payroll', 'fee', 'adjustment', 'opening'], default: 'manual' },
    sourceId:     { type: mongoose.Schema.Types.ObjectId },
    status:       { type: String, enum: ['draft', 'posted', 'reversed'], default: 'draft', index: true },
    postedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    postedAt:     { type: Date },
    reversedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reversedAt:   { type: Date },
    reverseOf:    { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

journalEntrySchema.index({ school: 1, entryNumber: 1 }, { unique: true, sparse: true });
journalEntrySchema.index({ school: 1, date: 1, status: 1 });

const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);
export default JournalEntry;
