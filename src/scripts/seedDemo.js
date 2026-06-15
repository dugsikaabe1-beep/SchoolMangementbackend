import mongoose from 'mongoose';
import School from '../models/School.js';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import Plan from '../models/Plan.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const seedDemo = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB for seeding...');

    // 1. Create Demo Plan
    let plan = await Plan.findOne({ name: 'Enterprise' });
    if (!plan) {
      plan = await Plan.create({
        name: 'Enterprise',
        price: 999,
        features: ['all'],
        maxStudents: 10000,
        maxBranches: 10,
        isPublic: true
      });
    }

    // 2. Create Demo School
    let school = await School.findOne({ subdomain: 'demo' });
    if (!school) {
      school = await School.create({
        name: 'DugsiKabe Demo School',
        subdomain: 'demo',
        email: 'demo@dugsihub.com',
        isActive: true,
        plan: plan._id,
        onboarding: { isCompleted: true }
      });
    }

    // 3. Create Demo Branch
    let branch = await Branch.findOne({ school: school._id });
    if (!branch) {
      branch = await Branch.create({
        name: 'Main Campus',
        school: school._id,
        address: '123 Education St',
        phone: '123456789'
      });
    }

    // 4. Create Demo Admin
    let admin = await User.findOne({ email: 'demo-admin@dugsihub.com' });
    if (!admin) {
      const hashedPassword = await bcrypt.hash('Demo123!', 10);
      admin = await User.create({
        name: 'Demo Admin',
        email: 'demo-admin@dugsihub.com',
        password: hashedPassword,
        role: 'schooladmin',
        school: school._id,
        branch: branch._id,
        schoolProfileCompleted: true
      });
    }

    // 5. Create Demo Teacher
    let teacher = await User.findOne({ email: 'demo-teacher@dugsihub.com' });
    if (!teacher) {
      const hashedPassword = await bcrypt.hash('Demo123!', 10);
      teacher = await User.create({
        name: 'Demo Teacher',
        email: 'demo-teacher@dugsihub.com',
        password: hashedPassword,
        role: 'teacher',
        school: school._id,
        branch: branch._id
      });
    }

    // 6. Create Demo Student
    let student = await User.findOne({ email: 'demo-student@dugsihub.com' });
    if (!student) {
      const hashedPassword = await bcrypt.hash('Demo123!', 10);
      student = await User.create({
        name: 'Demo Student',
        email: 'demo-student@dugsihub.com',
        password: hashedPassword,
        role: 'student',
        school: school._id,
        branch: branch._id
      });
    }

    console.log('Demo environment seeded successfully!');
    console.log('Admin Login: demo-admin@dugsihub.com / Demo123!');
    console.log('Teacher Login: demo-teacher@dugsihub.com / Demo123!');
    console.log('Student Login: demo-student@dugsihub.com / Demo123!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedDemo();
