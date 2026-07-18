import mongoose from 'mongoose';

const jobPostingSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    title:        { type: String, required: true, trim: true },
    department:   { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    designation:  { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
    description:  { type: String, trim: true },
    requirements: [{ type: String }],
    salaryRange:  { min: { type: Number }, max: { type: Number }, currency: { type: String, default: 'USD' } },
    employmentType: { type: String, enum: ['full_time', 'part_time', 'contract', 'internship'], default: 'full_time' },
    openings:     { type: Number, default: 1 },
    closingDate:  { type: Date },
    status:       { type: String, enum: ['draft', 'published', 'closed', 'filled'], default: 'draft', index: true },
    postedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    applicants:   [{
      name:       { type: String },
      email:      { type: String },
      phone:      { type: String },
      resumeUrl:  { type: String },
      appliedAt:  { type: Date },
      status:     { type: String, enum: ['applied', 'screening', 'interview', 'offered', 'hired', 'rejected'], default: 'applied' },
      notes:      { type: String },
    }],
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

const JobPosting = mongoose.model('JobPosting', jobPostingSchema);
export default JobPosting;
