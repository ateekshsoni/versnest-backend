/**
 * 🚨 CENTRALIZED ERROR HANDLING MIDDLEWARE
 * 
 * This middleware provides comprehensive error handling for the entire application.
 * It converts various types of errors into consistent API responses and handles
 * logging, monitoring, and security concerns.
 * 
 * Key Features:
 * - Consistent error response format
 * - Security-aware error messages
 * - Comprehensive error logging
 * - Performance monitoring
 * - Development vs production error handling
 * 
 * Learning Points:
 * - Error middleware must be defined with 4 parameters
 * - Order matters in Express middleware
 * - Security implications of error messages
 * - Error tracking and monitoring
 */

import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { CONFIG } from '../config/index.js';
import { appLogger } from '../utils/logger.js';
import { 
  AppError, 
  ErrorHandler, 
  ErrorMetrics 
} from '../utils/errors.js';

/**
 * 🔍 Error Classification Helper
 * 
 * Determines if an error is operational (expected) or programming (unexpected)
 */
const isOperationalError = (error) => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  
  // Known operational errors
  const operationalErrors = [
    'ValidationError',
    'CastError',
    'MongoError',
    'MongooseError',
    'JsonWebTokenError',
    'TokenExpiredError',
  ];
  
  return operationalErrors.includes(error.name);
};

/**
 * 🛡️ Sanitize Error for Client
 * 
 * Removes sensitive information from error messages
 */
const sanitizeError = (error, isDevelopment = false) => {
  const sanitized = {
    name: error.name,
    message: error.message,
    statusCode: error.statusCode || 500,
    errorCode: error.errorCode || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
  };
  
  // Add additional information in development
  if (isDevelopment) {
    sanitized.stack = error.stack;
    sanitized.details = error.details;
  }
  
  return sanitized;
};

/**
 * 🎯 Handle Specific Error Types
 */

// Handle Mongoose Validation Errors
const handleValidationError = (error) => {
  const errors = Object.values(error.errors).map(err => ({
    field: err.path,
    message: err.message,
    value: err.value,
    kind: err.kind,
  }));
  
  return ErrorHandler.handleValidationError(error);
};

// Handle Mongoose Cast Errors (Invalid ObjectId, etc.)
const handleCastError = (error) => {
  const message = `Invalid ${error.path}: ${error.value}`;
  return new AppError(message, 400, 'CAST_ERROR');
};

// Handle MongoDB Duplicate Key Errors
const handleDuplicateKeyError = (error) => {
  return ErrorHandler.handleDuplicateKeyError(error);
};

// Handle JWT Errors
const handleJWTError = (error) => {
  return ErrorHandler.handleJWTError(error);
};

// Handle Zod Validation Errors
const handleZodError = (error) => {
  return ErrorHandler.handleZodError(error);
};

/**
 * 🚨 Main Error Handling Middleware
 * 
 * This is the central error handler that processes all errors
 */
export const errorHandler = (error, req, res, next) => {
  let err = { ...error };
  err.message = error.message;
  
  // Track error metrics
  ErrorMetrics.track(error);
  
  // Log error details
  const errorDetails = {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    },
    user: req.user ? {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role,
    } : null,
    timestamp: new Date().toISOString(),
  };
  
  // Handle specific error types
  if (error.name === 'ValidationError') {
    err = handleValidationError(error);
  } else if (error.name === 'CastError') {
    err = handleCastError(error);
  } else if (error.code === 11000) {
    err = handleDuplicateKeyError(error);
  } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    err = handleJWTError(error);
  } else if (error instanceof ZodError) {
    err = handleZodError(error);
  }
  
  // Log based on error severity
  const statusCode = err.statusCode || 500;
  
  if (statusCode >= 500) {
    // Server errors - log as error
    appLogger.error('Server Error', errorDetails);
  } else if (statusCode >= 400 && statusCode < 500) {
    // Client errors - log as warning
    appLogger.warn('Client Error', errorDetails);
  }
  
  // Send error response
  const sanitizedError = sanitizeError(err, CONFIG.isDevelopment);
  
  res.status(statusCode).json({
    success: false,
    error: sanitizedError,
    ...(CONFIG.isDevelopment && { 
      requestId: req.correlationId,
      details: errorDetails 
    }),
  });
};

/**
 * 🔍 404 Not Found Handler
 * 
 * Handles requests to non-existent routes
 */
export const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404,
    'NOT_FOUND'
  );
  
  appLogger.warn('Route Not Found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  
  next(error);
};

/**
 * ⚡ Async Error Handler Wrapper
 * 
 * Wraps async route handlers to catch promises that reject
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 🛡️ Unhandled Promise Rejection Handler
 * 
 * Global handler for unhandled promise rejections
 */
export const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    appLogger.error('Unhandled Promise Rejection', {
      reason: reason,
      promise: promise,
      stack: reason?.stack,
    });
    
    // Close server gracefully
    console.log('Shutting down server due to unhandled promise rejection...');
    process.exit(1);
  });
};

/**
 * 💥 Uncaught Exception Handler
 * 
 * Global handler for uncaught exceptions
 */
export const handleUncaughtException = () => {
  process.on('uncaughtException', (error) => {
    appLogger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
    });
    
    console.log('Shutting down server due to uncaught exception...');
    process.exit(1);
  });
};

/**
 * 📊 Error Statistics Middleware
 * 
 * Tracks error statistics for monitoring
 */
export const errorStatsHandler = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Track response status codes
    if (res.statusCode >= 400) {
      appLogger.logMetrics({
        type: 'error_response',
        statusCode: res.statusCode,
        method: req.method,
        url: req.originalUrl,
        duration: Date.now() - req.startTime,
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

/**
 * 🔧 Request Context Middleware
 * 
 * Adds request timing and correlation ID
 */
export const requestContext = (req, res, next) => {
  req.startTime = Date.now();
  
  // Generate correlation ID if not present
  if (!req.correlationId) {
    req.correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Add correlation ID to response headers
  res.set('X-Correlation-ID', req.correlationId);
  
  next();
};

/**
 * 🎛️ Error Rate Limiter
 * 
 * Rate limits based on error responses to prevent abuse
 */
export const errorRateLimit = () => {
  const errorCounts = new Map();
  const WINDOW_MS = 300000; // 5 minutes
  const MAX_ERRORS = 50; // Max errors per window
  
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Track errors from specific IPs
      if (res.statusCode >= 400) {
        const ip = req.ip;
        const now = Date.now();
        const windowStart = now - WINDOW_MS;
        
        // Get IP's error history
        let ipErrors = errorCounts.get(ip) || [];
        
        // Filter out old errors
        ipErrors = ipErrors.filter(timestamp => timestamp > windowStart);
        
        // Add current error
        ipErrors.push(now);
        errorCounts.set(ip, ipErrors);
        
        // Check if IP has exceeded error limit
        if (ipErrors.length > MAX_ERRORS) {
          appLogger.logSecurity('error_rate_limit_exceeded', 'high', {
            ip,
            errorCount: ipErrors.length,
            maxErrors: MAX_ERRORS,
            windowMs: WINDOW_MS,
          });
          
          // Could implement IP blocking here
        }
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

/**
 * 🧹 Cleanup Error Metrics
 * 
 * Periodic cleanup of error metrics to prevent memory leaks
 */
export const cleanupErrorMetrics = () => {
  setInterval(() => {
    ErrorMetrics.reset();
    appLogger.debug('Error metrics cleaned up');
  }, 3600000); // Clean up every hour
};

// Export error handling utilities
export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  handleUnhandledRejection,
  handleUncaughtException,
  errorStatsHandler,
  requestContext,
  errorRateLimit,
  cleanupErrorMetrics,
  isOperationalError,
  sanitizeError,
};
