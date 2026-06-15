import mongoose from 'mongoose';

const knowledgeBaseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    content: { type: String, required: true },
    category: { type: String, required: true, index: true },
    type: { 
      type: String, 
      enum: ['article', 'faq', 'tutorial', 'video_guide'], 
      default: 'article' 
    },
    tags: [{ type: String }],
    videoUrl: { type: String },
    isPublished: { type: Boolean, default: true },
    viewCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

knowledgeBaseSchema.index({ title: 'text', content: 'text', tags: 'text' });

const KnowledgeBase = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
export default KnowledgeBase;
