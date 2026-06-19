import mongoose from 'mongoose';

const portfolioItemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  type: { 
    type: String, 
    enum: ['Certificate', 'Award', 'Project', 'Activity', 'Achievement', 'Other'],
    required: true 
  },
  description: { type: String, trim: true },
  date: { type: Date },
  attachments: [{ type: String }],
  remarks: { type: String, trim: true }
}, { _id: true, timestamps: true });

const portfolioSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [portfolioItemSchema],
    isPublic: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

portfolioSchema.index({ school: 1, student: 1 });

const Portfolio = mongoose.model('Portfolio', portfolioSchema);
export default Portfolio;
