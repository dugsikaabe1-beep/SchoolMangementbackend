/**
 * Error Mapper Utility
 * Converts technical backend errors into user-friendly messages
 */

// Common error patterns and their user-friendly messages
const errorPatterns = [
  // MongoDB Duplicate Key Errors
  {
    pattern: /duplicate key error.*collection.*index.*customId/i,
    message: 'This ID already exists. Please use a different ID.'
  },
  {
    pattern: /duplicate key error.*collection.*index.*email/i,
    message: 'This email is already registered. Please use a different email.'
  },
  {
    pattern: /duplicate key error.*collection/i,
    message: 'This record already exists.'
  },
  {
    pattern: /E11000.*duplicate key/i,
    message: 'This record already exists.'
  },
  
  {
    pattern: /Required fields missing: (.*)/i,
    message: 'Please fill in all required fields.'
  },
  // Validation Errors
  {
    pattern: /ValidationError.*required/i,
    message: 'Please fill in all required fields.'
  },
  {
    pattern: /maxStudents.*required/i,
    message: 'Maximum students field is required.'
  },
  {
    pattern: /name.*required/i,
    message: 'Name field is required.'
  },
  {
    pattern: /email.*required/i,
    message: 'Email field is required.'
  },
  {
    pattern: /password.*required/i,
    message: 'Password field is required.'
  },
  {
    pattern: /class.*required/i,
    message: 'Class field is required.'
  },
  {
    pattern: /subject.*required/i,
    message: 'Subject field is required.'
  },
  {
    pattern: /teacher.*required/i,
    message: 'Teacher field is required.'
  },
  
  // Cast Errors (Invalid ObjectId)
  {
    pattern: /Cast to ObjectId failed/i,
    message: 'Invalid ID format. Please check the ID and try again.'
  },
  
  // Network/Connection Errors
  {
    pattern: /ENOTFOUND|ECONNREFUSED|ECONNRESET/i,
    message: 'Unable to connect to server. Please check your internet connection.'
  },
  {
    pattern: /Network Error/i,
    message: 'Unable to connect. Check your internet connection.'
  },
  {
    pattern: /timeout/i,
    message: 'Request timed out. Please try again.'
  },
  
  // Authentication/Authorization Errors
  {
    pattern: /Unauthorized|Not authorized/i,
    message: 'Your session expired, please login again.'
  },
  {
    pattern: /token.*failed|invalid token|jwt expired/i,
    message: 'Your session expired, please login again.'
  },
  {
    pattern: /Forbidden|not authorized to access/i,
    message: 'You do not have permission to perform this action.'
  },
  
  // Not Found Errors
  {
    pattern: /Student not found/i,
    message: 'No student found with this ID.'
  },
  {
    pattern: /Teacher not found/i,
    message: 'No teacher found with this ID.'
  },
  {
    pattern: /Class not found/i,
    message: 'No class found with this ID.'
  },
  {
    pattern: /Subject not found/i,
    message: 'No subject found with this ID.'
  },
  {
    pattern: /Exam not found/i,
    message: 'No exam found with this ID.'
  },
  {
    pattern: /Schedule not found/i,
    message: 'No schedule found with this ID.'
  },
  {
    pattern: /Payment record not found/i,
    message: 'No payment record found.'
  },
  {
    pattern: /School not found/i,
    message: 'School information not found.'
  },
  {
    pattern: /User not found/i,
    message: 'User not found.'
  },
  {
    pattern: /Assignment not found/i,
    message: 'Subject assignment not found.'
  },
  {
    pattern: /not found/i,
    message: 'Record not found.'
  },
  
  // Login Errors
  {
    pattern: /Invalid.*password|password.*mismatch/i,
    message: 'Incorrect password. Please try again.'
  },
  {
    pattern: /Invalid.*ID|Invalid.*email/i,
    message: 'Invalid login credentials. Please check and try again.'
  },
  
  // Data Type Errors
  {
    pattern: /must be a number/i,
    message: 'Please enter a valid number.'
  },
  {
    pattern: /must be an integer/i,
    message: 'Please enter a whole number.'
  },
  {
    pattern: /must be greater than 0/i,
    message: 'Please enter a value greater than zero.'
  },
  {
    pattern: /invalid.*format|format.*invalid/i,
    message: 'Please enter valid information.'
  },
  
  // Marks/Exam Errors
  {
    pattern: /Marks exceed limit|marks.*greater than/i,
    message: 'Marks cannot be greater than total marks.'
  },
  {
    pattern: /Schedule conflict/i,
    message: 'This time slot is already scheduled. Please choose a different time.'
  },
  
  // Payment Errors
  {
    pattern: /Payment month.*already exists/i,
    message: 'This payment month already exists.'
  },
  
  // Subject Errors
  {
    pattern: /Subject code already exists/i,
    message: 'This subject code already exists.'
  },
  {
    pattern: /Subject code may only contain/i,
    message: 'Subject code may only contain letters and numbers (no spaces or symbols).'
  },
  
  // User Already Exists
  {
    pattern: /User already exists/i,
    message: 'A user with this email or ID already exists.'
  },
  
  // Exam Hall Errors
  {
    pattern: /already exists for this date and session/i,
    message: 'A hall with this name already exists for the selected date and session.'
  },
  {
    pattern: /capacity cannot be less than/i,
    message: 'Capacity cannot be less than the number of currently assigned students.'
  },
  {
    pattern: /already assigned to .* on this date|already assigned to another hall/i,
    message: 'One or more supervisors are already assigned to another hall on this date. A teacher cannot supervise in two different halls at the same time.'
  },
  {
    pattern: /already enrolled in .* session on this date|already enrolled in another hall/i,
    message: 'This student is already enrolled in another hall for this session. A student cannot be in two different halls at the same time.'
  },
  {
    pattern: /already assigned to this hall/i,
    message: 'This student is already assigned to this hall.'
  },
  {
    pattern: /exam hall is at full capacity/i,
    message: 'This exam hall is already at full capacity.'
  },
  
  // Generic fallback patterns
  {
    pattern: /Invalid user data/i,
    message: 'Please check your information and try again.'
  }
];

// Success message mappings
const successMessages = {
  'Student created successfully': 'Student added successfully.',
  'Teacher created successfully': 'Teacher added successfully.',
  'Student deleted successfully': 'Student removed successfully.',
  'Teacher deleted successfully': 'Teacher removed successfully.',
  'Student updated successfully': 'Student information updated.',
  'Teacher updated successfully': 'Teacher information updated.',
  'Class created successfully': 'Class created successfully.',
  'Class updated successfully': 'Class information updated.',
  'Class deleted successfully': 'Class removed successfully.',
  'Subject created successfully': 'Subject added successfully.',
  'Subject updated successfully': 'Subject information updated.',
  'Subject deleted successfully': 'Subject removed successfully.',
  'Marks saved successfully': 'Marks saved successfully.',
  'Marks submitted successfully': 'Marks submitted successfully.',
  'Bulk marks submitted successfully': 'All marks submitted successfully.',
  'Payment recorded successfully': 'Payment recorded successfully.',
  'Schedule created successfully': 'Schedule created successfully.',
  'Schedule updated successfully': 'Schedule updated successfully.',
  'Schedule deleted successfully': 'Schedule removed successfully.',
  'Exam created successfully': 'Exam created successfully.',
  'Exam updated successfully': 'Exam updated successfully.',
  'Exam deleted successfully': 'Exam removed successfully.',
  'Exam published': 'Exam published successfully.',
  'Password reset successfully': 'Password changed successfully.',
  'School settings updated successfully': 'Settings saved successfully.',
  'Attendance marked successfully': 'Attendance recorded successfully.',
  'Subject assigned to class': 'Subject assigned to class successfully.',
  'Subject removed from class': 'Subject removed from class successfully.',
  'Assignment updated': 'Assignment updated successfully.'
};

/**
 * Maps technical error messages to user-friendly messages
 * @param {string|Error} error - The error to map
 * @returns {string} User-friendly error message
 */
export const mapErrorMessage = (error) => {
  const errorMessage = typeof error === 'string' ? error : error?.message || 'Something went wrong';
  
  // Check against patterns
  for (const { pattern, message } of errorPatterns) {
    if (pattern.test(errorMessage)) {
      return message;
    }
  }
  
  // Return a generic friendly message if no pattern matches
  return 'Something went wrong. Please try again later.';
};

/**
 * Maps success messages to more user-friendly versions
 * @param {string} message - The original success message
 * @returns {string} User-friendly success message
 */
export const mapSuccessMessage = (message) => {
  // Check for exact matches
  if (successMessages[message]) {
    return successMessages[message];
  }
  
  // Check for partial matches
  for (const [key, value] of Object.entries(successMessages)) {
    if (message?.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  
  return message;
};

/**
 * Gets field-level validation errors from a Mongoose validation error
 * @param {Error} error - Mongoose validation error
 * @returns {Object} Object with field names as keys and user-friendly messages as values
 */
export const getValidationErrors = (error) => {
  const errors = {};
  
  if (error.name === 'ValidationError' && error.errors) {
    for (const [field, err] of Object.entries(error.errors)) {
      // Map technical field names to user-friendly labels
      const fieldLabels = {
        name: 'Name',
        email: 'Email',
        password: 'Password',
        customId: 'ID',
        class: 'Class',
        subject: 'Subject',
        teacher: 'Teacher',
        maxStudents: 'Maximum students',
        section: 'Section',
        amount: 'Amount',
        month: 'Month',
        year: 'Year',
        date: 'Date',
        status: 'Status'
      };
      
      const label = fieldLabels[field] || field;
      
      if (err.kind === 'required') {
        errors[field] = `${label} is required.`;
      } else if (err.kind === 'minlength') {
        errors[field] = `${label} is too short.`;
      } else if (err.kind === 'maxlength') {
        errors[field] = `${label} is too long.`;
      } else if (err.kind === 'regexp') {
        errors[field] = `Please enter a valid ${label.toLowerCase()}.`;
      } else {
        errors[field] = mapErrorMessage(err.message);
      }
    }
  }
  
  return errors;
};

/**
 * Creates a standardized error response object
 * @param {string|Error} error - The error
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Standardized error response
 */
export const createErrorResponse = (error, statusCode = 500) => {
  const errorMessage = typeof error === 'string' ? error : error?.message || 'Something went wrong';
  
  return {
    success: false,
    message: mapErrorMessage(error),
    userMessage: mapErrorMessage(error),
    technicalMessage: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    statusCode,
    errors: error.name === 'ValidationError' ? getValidationErrors(error) : undefined
  };
};

/**
 * Creates a standardized success response object
 * @param {string} message - Success message
 * @param {any} data - Response data
 * @returns {Object} Standardized success response
 */
export const createSuccessResponse = (message, data = null) => {
  const response = {
    success: true,
    message: mapSuccessMessage(message),
    userMessage: mapSuccessMessage(message)
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  return response;
};

export default {
  mapErrorMessage,
  mapSuccessMessage,
  getValidationErrors,
  createErrorResponse,
  createSuccessResponse
};
