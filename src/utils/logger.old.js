/**
 * 📝 PRODUCTION-GRADE LOGGING SYSTEM
 * 
 * This file implements a comprehensive logging system using Winston.
 * It provides structured logging with different log levels, formats,
 * and transports for development and production environments.
 * 
 * Key Features:
 * - Structured logging with JSON format
 * - Daily log rotation to prevent disk space issues
 * - Different log levels for different environments
 * - Request/Response logging integration
 * - Error tracking and correlation IDs
 * - Performance monitoring capabilities
 * 
 * Learning Points:
 * - Winston is the most popular logging library for Node.js
 * - Structured logging helps with log analysis and monitoring
 * - Log rotation prevents server storage issues
 * - Correlation IDs help track requests across services
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { CONFIG } from '../config/index.js';

/**
 * 🎨 Custom Log Formats
 * 
 * These formats determine how logs are structured and displayed
 */
const logFormats = {
  // Format for console output (development)
  console: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level}]: ${message}${metaStr}`;
    })
  ),

  // Format for file output (production)
  file: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),

  // Format for error files
  error: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf((info) => {
      if (info.stack) {
        return JSON.stringify({
          ...info,
          stack: info.stack
        });
      }
      return JSON.stringify(info);
    })
  )
};

/**
 * 📁 Log File Configuration
 * 
 * Daily rotating files prevent logs from consuming too much disk space
 */
const createDailyRotateTransport = (filename, level = 'info') => {
  return new DailyRotateFile({
    filename: `logs/${filename}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxSize: CONFIG.LOG_MAX_SIZE,
    maxFiles: CONFIG.LOG_MAX_FILES,
    level,
    format: level === 'error' ? logFormats.error : logFormats.file,
    zippedArchive: true,
  });
};

/**
 * 🚀 Main Logger Configuration
 * 
 * Creates the main logger instance with appropriate transports
 * based on the environment
 */
const createLogger = () => {
  const transports = [];

  // Console transport for development
  if (CONFIG.isDevelopment) {
    transports.push(
      new winston.transports.Console({
        level: CONFIG.LOG_LEVEL,
        format: logFormats.console,
      })
    );
  }

  // File transports for production and persistent logging
  if (CONFIG.isProduction || CONFIG.isDevelopment) {
    transports.push(
      // General application logs
      createDailyRotateTransport('application', CONFIG.LOG_LEVEL),
      
      // Error logs (separate file for easier monitoring)
      createDailyRotateTransport('error', 'error'),
      
      // Combined logs (all logs in one place)
      createDailyRotateTransport('combined', 'debug')
    );
  }

  return winston.createLogger({
    level: CONFIG.LOG_LEVEL,
    defaultMeta: {
      service: 'versenest-backend',
      environment: CONFIG.NODE_ENV,
    },
    transports,
    // Don't exit on handled exceptions
    exitOnError: false,
  });
};

// Create the main logger instance
const logger = createLogger();

/**
 * 🎯 Enhanced Logger with Additional Methods
 * 
 * This class extends the basic logger with domain-specific methods
 * that provide better context and structure for different types of logs
 */
class EnhancedLogger {
  constructor(baseLogger) {
    this.logger = baseLogger;
  }

  // Basic logging methods (delegate to Winston)
  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  /**
   * 🌐 HTTP Request Logging
   * 
   * Structured logging for HTTP requests with timing and metadata
   */
  logRequest(req, res, duration) {
    const meta = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      correlationId: req.correlationId,
      userId: req.user?.id || req.reader?.id || req.writer?.id,
    };

    const message = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms`;

    if (res.statusCode >= 500) {
      this.error(message, meta);
    } else if (res.statusCode >= 400) {
      this.warn(message, meta);
    } else {
      this.info(message, meta);
    }
  }

  /**
   * 🔐 Authentication Logging
   * 
   * Track authentication events for security monitoring
   */
  logAuth(event, details = {}) {
    this.info(`Authentication: ${event}`, {
      type: 'auth',
      event,
      ...details,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 🗄️ Database Operation Logging
   * 
   * Track database operations for performance monitoring
   */
  logDatabase(operation, model, duration, success = true) {
    const meta = {
      type: 'database',
      operation,
      model,
      duration: `${duration}ms`,
      success,
    };

    const message = `Database ${operation} on ${model} - ${duration}ms`;

    if (success) {
      this.debug(message, meta);
    } else {
      this.error(message, meta);
    }
  }

  /**
   * 🚨 Security Event Logging
   * 
   * Track security-related events for monitoring and alerting
   */
  logSecurity(event, severity = 'medium', details = {}) {
    const meta = {
      type: 'security',
      event,
      severity,
      ...details,
      timestamp: new Date().toISOString(),
    };

    const message = `Security Event: ${event}`;

    if (severity === 'high' || severity === 'critical') {
      this.error(message, meta);
    } else if (severity === 'medium') {
      this.warn(message, meta);
    } else {
      this.info(message, meta);
    }
  }

  /**
   * 📊 Performance Logging
   * 
   * Track performance metrics for optimization
   */
  logPerformance(operation, duration, metadata = {}) {
    const meta = {
      type: 'performance',
      operation,
      duration: `${duration}ms`,
      ...metadata,
    };

    const message = `Performance: ${operation} took ${duration}ms`;

    if (duration > 1000) {
      this.warn(message, meta);
    } else {
      this.debug(message, meta);
    }
  }

  /**
   * 🔄 Business Logic Logging
   * 
   * Track important business events
   */
  logBusiness(event, details = {}) {
    this.info(`Business Event: ${event}`, {
      type: 'business',
      event,
      ...details,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 📈 Metrics Logging
   * 
   * Track application metrics for monitoring
   */
  logMetrics(metrics) {
    this.info('Application Metrics', {
      type: 'metrics',
      ...metrics,
      timestamp: new Date().toISOString(),
    });
  }
}

// Create and export the enhanced logger instance
export const appLogger = new EnhancedLogger(logger);

// Export the base logger for direct access if needed
export { logger };

/**
 * 🎭 Express Request Logger Middleware
 * 
 * This middleware adds correlation IDs to requests and logs them
 */
export const requestLogger = (req, res, next) => {
  // Add correlation ID for tracking requests
  req.correlationId = req.get('X-Correlation-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Add correlation ID to response headers
  res.set('X-Correlation-ID', req.correlationId);
  
  const startTime = Date.now();
  
  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    appLogger.logRequest(req, res, duration);
  });
  
  next();
};

/**
 * 🔧 Logger Utilities
 * 
 * Utility functions for common logging patterns
 */
export const LoggerUtils = {
  /**
   * Create a child logger with additional context
   */
  createChildLogger(context) {
    return {
      ...appLogger,
      logger: logger.child(context),
    };
  },

  /**
   * Format error for logging
   */
  formatError(error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error.statusCode && { statusCode: error.statusCode }),
      ...(error.errorCode && { errorCode: error.errorCode }),
    };
  },

  /**
   * Sanitize sensitive data from logs
   */
  sanitize(data) {
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  },
};

export default appLogger;
