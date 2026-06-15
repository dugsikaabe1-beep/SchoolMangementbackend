import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, unique: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['technical', 'billing', 'feature_request', 'general'], 
      default: 'general' 
    },
    priority: { 
      type: String, 
      enum: ['low', 'medium', 'high', 'urgent'], 
      default: 'medium' 
    },
    status: { 
      type: String, 
      enum: ['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'], 
      default: 'open' 
    },
    responses: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      content: String,
      attachments: [String],
      createdAt: { type: Date, default: Date.now }
    }],
    attachments: [String],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
export default SupportTicket;
