import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function checkUser() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolManagementSystem');
  const User = mongoose.model('User', new mongoose.Schema({ email: String, role: String, password: String }, { collection: 'users' }));
  const users = await User.find({ role: { $in: ['superadmin', 'super_admin'] } });
  console.log("Superadmins:");
  console.log(users);
  
  const testUsers = await User.find({ email: 'admin@admin.com' });
  console.log("admin@admin.com users:");
  console.log(testUsers);
  
  process.exit(0);
}

checkUser();
