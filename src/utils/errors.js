/**
 * 🚨 CENTRALIZED ERROR HANDLING SYSTEM
 * 
 * This file implements a comprehensive error handling system using custom error
 * classes. This approach provides better error categorization, consistent error
 * responses, and improved debugging capabilities.
 * 
 * Design Patterns Used:
 * - Factory Pattern: For creating different types of errors
 * - Strategy Pattern: Different handling strategies for different error types
 * - Chain of Responsibility: Error handling middleware chain
 * 
 * Benefits:
 * - Consistent error responses across the API
 * - Better debugging with stack traces and error codes
 * - Separation of concerns between business logic and error handling
 * - Enhanced security by preventing information leakage
 */

/**
 * 🎯 Base Application Error Class
 * 
 * This is the foundation for all custom errors in the application.
 * It extends the native Error class and adds additional properties
 * for better error categorization and handling.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace, excluding constructor call from it
    Error.captureStackTrace(this, this.constructor);
    
    // Set error name to class name
    this.name = this.constructor.name;
  }
  
  /**
   * Convert error to JSON for API responses
   */
  toJSON() {
    return {
      error: {
        name: this.name,
        message: this.message,
        code: this.errorCode,
        timestamp: this.timestamp,
        ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
      }
    };
  }
}

/**
 * 🔍 Validation Error Class
 * 
 * Used for input validation failures (e.g., Zod validation errors)
 */
class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
  
  toJSON() {
    return {
      error: {
        name: this.name,
        message: this.message,
        code: this.errorCode,
        details: this.details,
        timestamp: this.timestamp,
      }
    };
  }
}

/**
 * 🔐 Authentication Error Class
 * 
 * Used for authentication failures (invalid tokens, expired sessions, etc.)
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * 🚫 Authorization Error Class
 * 
 * Used for authorization failures (insufficient permissions, role-based access)
 */
class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * 🔍 Not Found Error Class
 * 
 * Used when requested resources don't exist
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND_ERROR');
  }
}

/**
 * ⚡ Conflict Error Class
 * 
 * Used for conflicts like duplicate email addresses, username conflicts, etc.
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

/**
 * 🚦 Rate Limit Error Class
 * 
 * Used when rate limits are exceeded
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = 900) {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.retryAfter = retryAfter;
  }
  
  toJSON() {
    return {
      error: {
        name: this.name,
        message: this.message,
        code: this.errorCode,
        retryAfter: this.retryAfter,
        timestamp: this.timestamp,
      }
    };
  }
}

/**
 * 🗄️ Database Error Class
 * 
 * Used for database-related errors (connection issues, query failures, etc.)
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', originalError = null) {
    super(message, 500, 'DATABASE_ERROR');
    this.originalError = originalError;
  }
}

/**
 * 🌐 External Service Error Class
 * 
 * Used for external API or service failures
 */
class ExternalServiceError extends AppError {
  constructor(service, message = 'External service unavailable') {
    super(`${service}: ${message}`, 503, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

/**
 * 🏭 Error Factory
 * 
 * Factory function to create appropriate error instances based on error type
 * This promotes the DRY principle and ensures consistent error creation
 */
class ErrorFactory {
  static validation(message, details = []) {
    return new ValidationError(message, details);
  }
  
  static authentication(message) {
    return new AuthenticationError(message);
  }
  
  static authorization(message) {
    return new AuthorizationError(message);
  }
  
  static notFound(resource) {
    return new NotFoundError(resource);
  }
  
  static conflict(message) {
    return new ConflictError(message);
  }
  
  static rateLimit(message, retryAfter) {
    return new RateLimitError(message, retryAfter);
  }
  
  static database(message, originalError) {
    return new DatabaseError(message, originalError);
  }
  
  static externalService(service, message) {
    return new ExternalServiceError(service, message);
  }
  
  static internal(message) {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }
}

/**
 * 🎯 Error Handler Utilities
 * 
 * Utility functions for common error handling patterns
 */
class ErrorHandler {
  /**
   * Handle MongoDB duplicate key errors
   */
  static handleDuplicateKeyError(error) {
    const field = Object.keys(error.keyValue)[0];
    const message = `${field} already exists`;
    return new ConflictError(message);
  }
  
  /**
   * Handle MongoDB validation errors
   */
  static handleValidationError(error) {
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));
    return new ValidationError('Validation failed', errors);
  }
  
  /**
   * Handle JWT errors
   */
  static handleJWTError(error) {
    if (error.name === 'JsonWebTokenError') {
      return new AuthenticationError('Invalid token');
    }
    if (error.name === 'TokenExpiredError') {
      return new AuthenticationError('Token expired');
    }
    return new AuthenticationError('Authentication failed');
  }
  
  /**
   * Handle Zod validation errors
   */
  static handleZodError(error) {
    const details = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code
    }));
    return new ValidationError('Input validation failed', details);
  }
}

/**
 * 📊 Error Metrics and Monitoring
 * 
 * This class helps track error patterns for monitoring and alerting
 */
class ErrorMetrics {
  static errorCounts = new Map();
  
  static track(error) {
    const key = `${error.name}:${error.statusCode}`;
    const current = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, current + 1);
  }
  
  static getMetrics() {
    return Object.fromEntries(this.errorCounts);
  }
  
  static reset() {
    this.errorCounts.clear();
  }
}

// CommonJS exports
module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  ErrorFactory,
  ErrorHandler,
  ErrorMetrics
};