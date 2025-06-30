/**
 * Response Utilities
 * 
 * This module provides standardized response formatting functions
 * for consistent API responses across the application.
 * 
 * Features:
 * - Consistent response structure
 * - Success and error response helpers
 * - Pagination metadata formatting
 * - HTTP status code management
 * - Response time tracking
 * 
 * Learning Notes:
 * - Consistent API responses improve client-side handling
 * - Standardized error formats help with debugging
 * - Pagination metadata follows REST conventions
 * - Response utilities reduce code duplication
 */

/**
 * Standard success response format
 * 
 * @param {Object} res - Express response object
 * @param {any} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {Object} meta - Additional metadata (pagination, etc.)
 * @returns {Object} Formatted response
 */
const successResponse = (res, data = null, message = 'Success', statusCode = 200, meta = null) => {
  const response = {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  // Add metadata if provided (useful for pagination)
  if (meta) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

/**
 * Standard error response format
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {any} errors - Detailed error information
 * @param {string} code - Error code for client-side handling
 * @returns {Object} Formatted error response
 */
const errorResponse = (res, message = 'Internal Server Error', statusCode = 500, errors = null, code = null) => {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString(),
  };

  // Add error code if provided
  if (code) {
    response.code = code;
  }

  // Add detailed errors if provided (validation errors, etc.)
  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

/**
 * Paginated response format
 * 
 * @param {Object} res - Express response object
 * @param {Array} data - Array of items
 * @param {Object} pagination - Pagination information
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} Formatted paginated response
 */
const paginatedResponse = (res, data, pagination, message = 'Success', statusCode = 200) => {
  const meta = {
    pagination: {
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      itemsPerPage: pagination.itemsPerPage,
      hasNextPage: pagination.hasNextPage,
      hasPrevPage: pagination.hasPrevPage,
    }
  };

  return successResponse(res, data, message, statusCode, meta);
};

/**
 * Created response (201 status)
 * 
 * @param {Object} res - Express response object
 * @param {any} data - Created resource data
 * @param {string} message - Success message
 * @returns {Object} Formatted response
 */
const createdResponse = (res, data, message = 'Resource created successfully') => {
  return successResponse(res, data, message, 201);
};

/**
 * No content response (204 status)
 * 
 * @param {Object} res - Express response object
 * @returns {Object} Empty response
 */
const noContentResponse = (res) => {
  return res.status(204).send();
};

/**
 * Bad request response (400 status)
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {any} errors - Validation errors
 * @returns {Object} Formatted error response
 */
const badRequestResponse = (res, message = 'Bad Request', errors = null) => {
  return errorResponse(res, message, 400, errors, 'BAD_REQUEST');
};

/**
 * Unauthorized response (401 status)
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @returns {Object} Formatted error response
 */
const unauthorizedResponse = (res, message = 'Unauthorized') => {
  return errorResponse(res, message, 401, null, 'UNAUTHORIZED');
};

/**
 * Forbidden response (403 status)
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @returns {Object} Formatted error response
 */
const forbiddenResponse = (res, message = 'Forbidden') => {
  return errorResponse(res, message, 403, null, 'FORBIDDEN');
};

/**
 * Not found response (404 status)
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @returns {Object} Formatted error response
 */
const notFoundResponse = (res, message = 'Resource not found') => {
  return errorResponse(res, message, 404, null, 'NOT_FOUND');
};

/**
 * Conflict response (409 status)
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @returns {Object} Formatted error response
 */
const conflictResponse = (res, message = 'Conflict') => {
  return errorResponse(res, message, 409, null, 'CONFLICT');
};

/**
 * Validation error response (422 status)
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {any} errors - Validation errors
 * @returns {Object} Formatted error response
 */
const validationErrorResponse = (res, message = 'Validation failed', errors = null) => {
  return errorResponse(res, message, 422, errors, 'VALIDATION_ERROR');
};

/**
 * Rate limit exceeded response (429 status)
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @returns {Object} Formatted error response
 */
const rateLimitResponse = (res, message = 'Rate limit exceeded') => {
  return errorResponse(res, message, 429, null, 'RATE_LIMIT_EXCEEDED');
};

/**
 * Internal server error response (500 status)
 * 
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @returns {Object} Formatted error response
 */
const internalServerErrorResponse = (res, message = 'Internal Server Error') => {
  return errorResponse(res, message, 500, null, 'INTERNAL_SERVER_ERROR');
};

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse,
  createdResponse,
  noContentResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  conflictResponse,
  validationErrorResponse,
  rateLimitResponse,
  internalServerErrorResponse,
};
