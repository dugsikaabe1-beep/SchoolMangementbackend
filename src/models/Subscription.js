import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  status: { 
    type: String, 
    enum: ['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'expired'], 
    default: 'trialing' 
  },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  trialEndDate: { type: Date },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  paymentMethod: { type: String }, // e.g., "stripe", "manual", "evc_plus"
  lastPaymentDate: { type: Date },
  nextBillingDate: { type: Date },
}, { timestamps: true });

const Subscription = mongoose.model('Subscription', subscriptionSchema);
export default Subscription;
