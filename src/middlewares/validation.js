/**
 * Validation Middleware
 * 
 * This middleware provides request validation using Zod schemas.
 * It validates request body, query parameters, and URL parameters
 * before they reach the controllers.
 * 
 * Features:
 * - Request body validation
 * - Query parameter validation
 * - URL parameter validation
 * - Detailed error messages
 * - Custom validation rules
 * 
 * Learning Notes:
 * - Validation middleware runs before controllers
 * - Zod provides type-safe validation with TypeScript benefits
 * - Detailed error messages help with debugging
 * - Early validation prevents invalid data from reaching business logic
 */

const { validationErrorResponse } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Create validation middleware for request validation
 * 
 * @param {Object} schema - Zod schema object with optional body, query, params
 * @returns {Function} Express middleware function
 */
const validate = (schema) => {
  return (req, res, next) => {
    try {
      const validationResults = {};
      const errors = {};

      // Validate request body if schema provided
      if (schema.body) {
        const bodyResult = schema.body.safeParse(req.body);
        if (!bodyResult.success) {
          errors.body = formatZodErrors(bodyResult.error);
        } else {
          validationResults.body = bodyResult.data;
        }
      }

      // Validate query parameters if schema provided
      if (schema.query) {
        const queryResult = schema.query.safeParse(req.query);
        if (!queryResult.success) {
          errors.query = formatZodErrors(queryResult.error);
        } else {
          validationResults.query = queryResult.data;
        }
      }

      // Validate URL parameters if schema provided
      if (schema.params) {
        const paramsResult = schema.params.safeParse(req.params);
        if (!paramsResult.success) {
          errors.params = formatZodErrors(paramsResult.error);
        } else {
          validationResults.params = paramsResult.data;
        }
      }

      // If there are validation errors, return error response
      if (Object.keys(errors).length > 0) {
        logger.warn('Validation failed', {
          url: req.originalUrl,
          method: req.method,
          errors,
          userId: req.user?.id
        });

        return validationErrorResponse(
          res,
          'Validation failed',
          errors
        );
      }

      // Store validated data in request object for use in controllers
      req.validated = validationResults;

      next();
    } catch (error) {
      logger.error('Validation middleware error', {
        error: error.message,
        url: req.originalUrl,
        method: req.method
      });

      return validationErrorResponse(
        res,
        'Validation error occurred',
        { general: 'Invalid request format' }
      );
    }
  };
};

/**
 * Format Zod validation errors into a readable format
 * 
 * @param {Object} zodError - Zod validation error object
 * @returns {Array} Array of formatted error objects
 */
const formatZodErrors = (zodError) => {
  return zodError.errors.map((error) => ({
    field: error.path.join('.'),
    message: error.message,
    code: error.code,
    received: error.received,
  }));
};

/**
 * Validate request body only
 * 
 * @param {Object} schema - Zod schema for body validation
 * @returns {Function} Express middleware function
 */
const validateBody = (schema) => {
  return validate({ body: schema });
};

/**
 * Validate query parameters only
 * 
 * @param {Object} schema - Zod schema for query validation
 * @returns {Function} Express middleware function
 */
const validateQuery = (schema) => {
  return validate({ query: schema });
};

/**
 * Validate URL parameters only
 * 
 * @param {Object} schema - Zod schema for params validation
 * @returns {Function} Express middleware function
 */
const validateParams = (schema) => {
  return validate({ params: schema });
};

/**
 * Optional validation middleware
 * Validates data if present but doesn't fail if missing
 * 
 * @param {Object} schema - Zod schema object
 * @returns {Function} Express middleware function
 */
const optionalValidate = (schema) => {
  return (req, res, next) => {
    try {
      const validationResults = {};

      // Optional validation for body
      if (schema.body && Object.keys(req.body).length > 0) {
        const bodyResult = schema.body.safeParse(req.body);
        if (bodyResult.success) {
          validationResults.body = bodyResult.data;
        }
      }

      // Optional validation for query
      if (schema.query && Object.keys(req.query).length > 0) {
        const queryResult = schema.query.safeParse(req.query);
        if (queryResult.success) {
          validationResults.query = queryResult.data;
        }
      }

      // Optional validation for params
      if (schema.params && Object.keys(req.params).length > 0) {
        const paramsResult = schema.params.safeParse(req.params);
        if (paramsResult.success) {
          validationResults.params = paramsResult.data;
        }
      }

      // Store validated data
      req.validated = validationResults;

      next();
    } catch (error) {
      logger.error('Optional validation middleware error', {
        error: error.message,
        url: req.originalUrl,
        method: req.method
      });

      next(); // Continue without validation in optional mode
    }
  };
};

/**
 * Validation middleware for file uploads
 * 
 * @param {Object} options - File validation options
 * @returns {Function} Express middleware function
 */
const validateFile = (options = {}) => {
  const {
    maxSize = 5 * 1024 * 1024, // 5MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif'],
    required = false
  } = options;

  return (req, res, next) => {
    try {
      if (!req.file && !req.files) {
        if (required) {
          return validationErrorResponse(
            res,
            'File upload is required',
            { file: 'No file provided' }
          );
        }
        return next();
      }

      const files = req.files || [req.file];
      const errors = [];

      files.forEach((file, index) => {
        if (file.size > maxSize) {
          errors.push({
            field: `file[${index}].size`,
            message: `File size exceeds maximum allowed size of ${maxSize} bytes`,
            received: file.size
          });
        }

        if (!allowedTypes.includes(file.mimetype)) {
          errors.push({
            field: `file[${index}].type`,
            message: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
            received: file.mimetype
          });
        }
      });

      if (errors.length > 0) {
        logger.warn('File validation failed', {
          url: req.originalUrl,
          method: req.method,
          errors,
          userId: req.user?.id
        });

        return validationErrorResponse(
          res,
          'File validation failed',
          { file: errors }
        );
      }

      next();
    } catch (error) {
      logger.error('File validation middleware error', {
        error: error.message,
        url: req.originalUrl,
        method: req.method
      });

      return validationErrorResponse(
        res,
        'File validation error occurred',
        { file: 'Invalid file format' }
      );
    }
  };
};

module.exports = {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  optionalValidate,
  validateFile,
  formatZodErrors,
};
