import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function resetPassword() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolManagementSystem');
  
  const User = mongoose.model('User', new mongoose.Schema({ email: String, role: String, password: String, isSuperAdmin: Boolean, name: String }, { collection: 'users' }));
  
  let admin = await User.findOne({ email: 'admin@admin.com' });
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash('123456', salt);

  if (admin) {
    console.log("Admin found. Updating password to 123456...");
    await User.updateOne({ _id: admin._id }, { $set: { password: hashedPassword, role: 'superadmin', isSuperAdmin: true } });
    console.log("Updated.");
  } else {
    console.log("Admin not found. Creating...");
    await User.create({
      name: 'Super Admin',
      email: 'admin@admin.com',
      password: hashedPassword,
      role: 'superadmin',
      isSuperAdmin: true
    });
    console.log("Created.");
  }
  
  process.exit(0);
}

resetPassword();
