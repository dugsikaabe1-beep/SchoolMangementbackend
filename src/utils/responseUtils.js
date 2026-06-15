/**
 * Standard API Response Utilities
 */

/**
 * Send a success response
 * @param {Response} res - Express response object
 * @param {Object} data - Data to return
 * @param {Object} meta - Pagination or other metadata
 * @param {number} status - HTTP status code
 */
export const sendSuccess = (res, data = {}, meta = null, status = 200) => {
  const response = {
    success: true,
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  return res.status(status).json(response);
};

/**
 * Send an error response
 * @param {Response} res - Express response object
 * @param {string} code - Error code (e.g., 'FORBIDDEN', 'NOT_FOUND')
 * @param {string} message - Error message for developers
 * @param {string} userMessage - Friendly error message for end-users
 * @param {number} status - HTTP status code
 */
export const sendError = (res, code, message, userMessage = null, status = 400) => {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
    },
    userMessage: userMessage || message,
  });
};

/**
 * Pagination helper for meta object
 * @param {number} page 
 * @param {number} limit 
 * @param {number} total 
 */
export const getPaginationMeta = (page, limit, total) => {
  return {
    page: parseInt(page),
    limit: parseInt(limit),
    total: parseInt(total),
    pages: Math.ceil(total / limit),
  };
};
