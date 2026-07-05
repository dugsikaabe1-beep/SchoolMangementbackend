import mongoose from 'mongoose';
import dotenv from 'dotenv';
import School from '../models/School.js';
import Branch from '../models/Branch.js';
import User from '../models/User.js';

// Load environment variables
dotenv.config();

const backfillMainBranches = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management');
    console.log('✅ Connected to MongoDB');

    // Get all schools
    const schools = await School.find({ isActive: true });
    console.log(`📚 Found ${schools.length} schools`);

    for (const school of schools) {
      // Check if school already has a Main Branch
      const existingMainBranch = await Branch.findOne({ 
        tenant: school._id, 
        isMain: true 
      });

      if (existingMainBranch) {
        console.log(`✅ School "${school.name}" already has a Main Branch`);
        continue;
      }

      // Create Main Branch
      const mainBranch = await Branch.create({
        tenant: school._id,
        name: 'Main Branch',
        code: 'MAIN',
        address: school.address || '',
        city: school.city || '',
        country: school.country || '',
        phone: school.phone || '',
        email: school.email || '',
        principalName: school.principal || '',
        isMain: true,
        status: 'active'
      });

      console.log(`✅ Created Main Branch for school "${school.name}"`);

      // Update School Admin (if exists)
      if (school.admin) {
        const adminUser = await User.findById(school.admin);
        if (adminUser) {
          adminUser.branch = mainBranch._id;
          adminUser.branchScope = 'ALL_BRANCHES';
          await adminUser.save();
          console.log(`✅ Updated School Admin "${adminUser.name}" for "${school.name}"`);
        }
      }
    }

    console.log('🎉 Backfill completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during backfill:', error);
    process.exit(1);
  }
};

backfillMainBranches();
