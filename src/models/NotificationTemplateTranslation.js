import mongoose from 'mongoose';

const templateTranslationSchema = new mongoose.Schema(
  {
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationTemplate', required: true, index: true },
    language: { type: String, required: true, index: true },
    subject: { type: String },
    body: { type: String },
    placeholders: [{ type: String }]
  },
  { timestamps: true }
);

templateTranslationSchema.index({ templateId: 1, language: 1 }, { unique: true });

const NotificationTemplateTranslation = mongoose.model('NotificationTemplateTranslation', templateTranslationSchema);
export default NotificationTemplateTranslation;
