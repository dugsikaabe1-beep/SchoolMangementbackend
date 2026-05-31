import User from '../models/User.js';
import School from '../models/School.js';

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
    exists = await User.findOne({ customId: candidate });
    attempts++;
  }

  if (exists) {
    // Ultimate fallback if collisions happen (very unlikely)
    candidate = `${prefix}${typePrefix}${Date.now().toString().slice(-6)}`;
  }
  
  return candidate;
};
