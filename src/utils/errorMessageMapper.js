/**
 * Error Message Mapping Utility
 * Automatically generates user-friendly messages from technical error messages
 */

// Map of common technical errors to user-friendly messages
const errorMap = {
  // Not Found errors
  'student not found': 'The student you are looking for could not be found.',
  'teacher not found': 'The teacher you are looking for could not be found.',
  'class not found': 'The class you are looking for could not be found.',
  'subject not found': 'The subject you are looking for could not be found.',
  'exam not found': 'The exam you are looking for could not be found.',
  'schedule not found': 'The schedule you are looking for could not be found.',
  'payment month not found': 'The payment month configuration could not be found.',
  'assignment not found': 'The assignment you are looking for could not be found.',
  'user not found': 'The user could not be found.',
  'school not found': 'The school could not be found.',
  
  // Validation errors
  'class name is required': 'Class name is required.',
  'section is required': 'Section is required.',
  'teacher is required': 'Please select a teacher for this assignment.',
  'subject is required': 'Please select a subject.',
  'name is required': 'Name is required.',
  'email is required': 'Email address is required.',
  'password is required': 'Password is required.',
  
  // Number validation
  'max students must be a number': 'Maximum students must be a valid number.',
  'max students must be an integer': 'Maximum students must be a whole number (no decimals).',
  'max students must be greater than 0': 'Maximum students must be greater than zero.',
  
  // Duplicate errors
  'class with this name and section already exists': 'A class with this name and section already exists. Please choose a different name or section.',
  'subject with this code already exists': 'A subject with this code already exists. Please use a different code.',
  'teacher id already exists': 'This Teacher ID is already in use. Please choose a different ID.',
  'student id already exists': 'This Student ID is already in use. Please choose a different ID.',
  'email already exists': 'This email is already registered. Please use a different email.',
  
  // Authorization errors
  'you are not assigned to this subject in this class': 'You are not assigned to teach this subject in this class. Please contact your administrator.',
  'invalid teacher for this school': 'This teacher does not belong to your school. Please select a teacher from your school.',
  'class or subject not found': 'The class or subject you selected could not be found. Please check your selection.',
  
  // Invalid data
  'invalid exam type': 'The exam type selected is not valid. Please choose a valid exam type.',
  'invalid date format': 'The date format is not valid. Please use the correct date format (YYYY-MM-DD).',
  'invalid time format': 'The time format is not valid. Please use the correct time format (HH:MM).',
  
  // Default fallback
  'default': 'An error occurred while processing your request. Please try again.'
};

/**
 * Get user-friendly error message from technical message
 * @param {string} technicalMessage - The technical error message
 * @returns {string} User-friendly error message
 */
export const getUserFriendlyMessage = (technicalMessage) => {
  if (!technicalMessage) {
    return errorMap['default'];
  }
  
  const lowerMessage = technicalMessage.toLowerCase();
  
  // Check for exact or partial matches
  for (const [key, friendlyMessage] of Object.entries(errorMap)) {
    if (lowerMessage.includes(key)) {
      return friendlyMessage;
    }
  }
  
  // If no match found, return the original message or default
  return technicalMessage || errorMap['default'];
};

/**
 * Middleware to ensure all error responses have userMessage
 */
export const ensureUserMessage = (req, res, next) => {
  // Store original json method
  const originalJson = res.json.bind(res);
  
  // Override json method
  res.json = function(data) {
    // If response has message but no userMessage, add it
    if (data && data.message && !data.userMessage) {
      data.userMessage = getUserFriendlyMessage(data.message);
    }
    
    // Call original json with modified data
    return originalJson(data);
  };
  
  next();
};

export default { getUserFriendlyMessage, ensureUserMessage };
