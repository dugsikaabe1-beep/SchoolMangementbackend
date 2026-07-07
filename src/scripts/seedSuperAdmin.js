import mongoose from 'mongoose';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

export const seedSuperAdmin = async () => {
  try {
    console.log('[Super Admin Seeding] Checking for default Super Admin account...');

    const email = 'asadisse12@gmail.com';
    const password = 'Hooyo@mcn123';

    // Check if Super Admin exists
    let superAdmin = await User.findOne({ email: email.toLowerCase() });

    if (superAdmin) {
      console.log('[Super Admin Seeding] Super Admin already exists. Updating if necessary...');
      
      // Ensure role is Super Admin, status is active, isEmailVerified is true
      const needsUpdate = 
        superAdmin.role !== 'superadmin' ||
        superAdmin.role !== 'super_admin' ||
        !superAdmin.isSuperAdmin ||
        superAdmin.status !== 'active' ||
        !superAdmin.isEmailVerified;

      if (needsUpdate) {
        superAdmin.role = 'superadmin';
        superAdmin.isSuperAdmin = true;
        superAdmin.status = 'active';
        superAdmin.isEmailVerified = true;
        await superAdmin.save();
        console.log('[Super Admin Seeding] Super Admin updated successfully!');
      } else {
        console.log('[Super Admin Seeding] Super Admin is already up to date!');
      }
    } else {
      console.log('[Super Admin Seeding] Creating default Super Admin...');
      
      // Hash password using bcrypt (12 rounds, matching user schema)
      const hashedPassword = await bcrypt.hash(password, 12);
      
      superAdmin = await User.create({
        name: 'Super Admin',
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'superadmin',
        isSuperAdmin: true,
        status: 'active',
        isEmailVerified: true,
        credentialsGenerated: true,
      });

      console.log('[Super Admin Seeding] Super Admin created successfully!');
    }

    console.log('[Super Admin Seeding] Successfully ensured Super Admin account is active!');
    return true;
  } catch (error) {
    console.error('[Super Admin Seeding] Failed:', error);
    return false;
  }
};

// Run directly if called as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  const main = async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB for Super Admin seeding...');
      await seedSuperAdmin();
      process.exit(0);
    } catch (err) {
      console.error('Failed to run seed script:', err);
      process.exit(1);
    }
  };
  main();
}

export default seedSuperAdmin;
