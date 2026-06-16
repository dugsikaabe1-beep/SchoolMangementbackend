import mongoose from 'mongoose';

const communicationPreferencesSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },
    email: {
      enabled: { type: Boolean, default: true },
      allowMarketing: { type: Boolean, default: false }
    },
    sms: {
      enabled: { type: Boolean, default: true },
      allowMarketing: { type: Boolean, default: false }
    },
    whatsapp: {
      enabled: { type: Boolean, default: true },
      allowMarketing: { type: Boolean, default: false }
    },
    push: {
      enabled: { type: Boolean, default: true },
      allowMarketing: { type: Boolean, default: false }
    },
    inApp: {
      enabled: { type: Boolean, default: true }
    },
    categoryPreferences: {
      attendance: {
        sms: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true }
      },
      fees: {
        sms: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true }
      },
      exams: {
        sms: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true }
      },
      announcements: {
        sms: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true }
      },
      emergencies: {
        sms: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true }
      }
    }
  },
  { timestamps: true }
);

const CommunicationPreferences = mongoose.model('CommunicationPreferences', communicationPreferencesSchema);
export default CommunicationPreferences;
