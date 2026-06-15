import mongoose from 'mongoose';

const transportRouteSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    title: { type: String, required: true, trim: true }, // e.g. "Route A - North"
    stops: [{
      name: { type: String, required: true },
      time: { type: String }, // e.g. "07:30 AM"
    }],
    fare: { type: Number, default: 0 },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Composite unique index: route title must be unique per school per branch
transportRouteSchema.index({ school: 1, branch: 1, title: 1 }, { unique: true, sparse: true });

const TransportRoute = mongoose.model('TransportRoute', transportRouteSchema);
export default TransportRoute;
