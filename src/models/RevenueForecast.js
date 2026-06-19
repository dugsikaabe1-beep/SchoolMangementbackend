import mongoose from 'mongoose';

const forecastDataSchema = new mongoose.Schema({
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  forecastedAmount: { type: Number, required: true, min: 0 },
  actualAmount: { type: Number, min: 0, default: 0 },
  difference: { type: Number, default: 0 }
}, { _id: false });

const revenueForecastSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    type: { 
      type: String, 
      enum: ['Monthly', 'Quarterly', 'Annual'], 
      required: true,
      index: true
    },
    year: { type: Number, required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    data: [forecastDataSchema],
    totalForecasted: { type: Number, required: true, min: 0 },
    totalActual: { type: Number, default: 0 },
    status: { type: String, enum: ['Draft', 'Final'], default: 'Draft' },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

revenueForecastSchema.index({ school: 1, year: -1, type: 1 });

const RevenueForecast = mongoose.model('RevenueForecast', revenueForecastSchema);
export default RevenueForecast;
