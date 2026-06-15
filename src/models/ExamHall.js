import mongoose from 'mongoose';

const examHallSchema = new mongoose.Schema(
  {
    school: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'School', 
      required: true,
      index: true
    },
    branch: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Branch', 
      required: true,
      index: true
    },
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
    capacity: { 
      type: Number, 
      required: true,
      min: 1
    },
    students: [
      {
        student: { 
          type: mongoose.Schema.Types.ObjectId, 
          ref: 'User' 
        },
        seatNumber: { 
          type: String 
        }
      }
    ],
    supervisors: [
      { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
      }
    ], // Teachers assigned to this hall
    examDate: {
      type: Date,
      required: true
    },
    examSession: {
      type: String,
      enum: ['Morning', 'Afternoon', 'Evening'],
      default: 'Morning'
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Unique hall name per school per branch per session per date
examHallSchema.index({ school: 1, branch: 1, name: 1, examDate: 1, examSession: 1 }, { unique: true });

const ExamHall = mongoose.model('ExamHall', examHallSchema);
export default ExamHall;
