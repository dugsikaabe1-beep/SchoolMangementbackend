import User from '../models/User.js';
import School from '../models/School.js';
import mongoose from 'mongoose';

/**
 * Extracts a 2-letter prefix from a school name.
 * If multiple words, takes the first letter of the first two words.
 * If one word, takes the first two letters.
 * @param {string} schoolName 
 * @returns {string} 2-letter uppercase prefix
 */
export const getSchoolPrefix = (schoolName) => {
  if (!schoolName) return 'SC';
  const words = schoolName.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return schoolName.substring(0, 2).toUpperCase();
};

/**
 * Generates a unique ID for a student or teacher based on the school name.
 * Format: [SchoolPrefix][RolePrefix][6RandomDigits]
 * Example: HJSTD286736 (Hamar Jajab Student)
 * @param {string} role - 'student' or 'teacher'
 * @param {string} schoolId 
 * @returns {Promise<string>} Unique customId
 */
export const generateCustomId = async (role, schoolId) => {
  const school = await School.findById(schoolId);
  if (!school) throw new Error('School not found');
  
  const prefix = getSchoolPrefix(school.name);
  const typePrefix = role === 'student' ? 'STD' : 'TCH';
  
  let candidate;
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    const randomNumber = Math.floor(100000 + Math.random() * 900000); // 6 digits
    candidate = `${prefix}${typePrefix}${randomNumber}`;
    exists = await User.findOne({ school: schoolId, customId: candidate });
    attempts++;
  }

  if (exists) {
    // Ultimate fallback if collisions happen (very unlikely)
    candidate = `${prefix}${typePrefix}${Date.now().toString().slice(-6)}`;
  }
  
  return candidate;
};

/**
 * Calculate the overall Health Score for a school based on critical metrics.
 */
export const calculateSchoolHealthScore = async (schoolId) => {
  try {
    const [attendanceCount, studentCount, paymentCount, paidPaymentCount, examCount, publishedExamCount] = await Promise.all([
      User.countDocuments({ school: schoolId, role: 'student', status: 'active' }),
      User.countDocuments({ school: schoolId, role: 'student' }),
      // Attendance logic would need specific date range, let's simplify for score
      mongoose.model('Attendance').countDocuments({ school: schoolId }),
      mongoose.model('MonthlyPayment').countDocuments({ school: schoolId }),
      mongoose.model('MonthlyPayment').countDocuments({ school: schoolId, status: 'PAID' }),
      mongoose.model('Exam').countDocuments({ school: schoolId }),
      mongoose.model('Exam').countDocuments({ school: schoolId, status: 'published' })
    ]);

    const attendanceRate = attendanceCount > 0 ? 85 : 0; // Simplified placeholder
    const collectionRate = paymentCount > 0 ? (paidPaymentCount / paymentCount) * 100 : 0;
    const examRate = examCount > 0 ? (publishedExamCount / examCount) * 100 : 0;

    const score = Math.round((attendanceRate * 0.4) + (collectionRate * 0.4) + (examRate * 0.2));
    
    let rating = 'Needs Attention';
    if (score >= 90) rating = 'Excellent';
    else if (score >= 75) rating = 'Good';
    else if (score >= 50) rating = 'Average';

    await School.findByIdAndUpdate(schoolId, {
      'subscription.healthScore': {
        score,
        rating,
        lastCalculated: new Date()
      }
    });

    return { score, rating };
  } catch (error) {
    console.error('Health Score Error:', error);
    return null;
  }
};
