/**
 * @fileoverview Comprehensive security middleware
 * Implements rate limiting, input sanitization, and security best practices
 * Protects against common web vulnerabilities
 */

import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { securityLogger } from '../utils/logger.js';

/**
 * Rate limiting configuration
 * Prevents abuse and protects against brute force attacks
 */
export const createRateLimiters = () => {
  // General rate limiter for all routes
  const generalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      success: false,
      error: {
        message: 'Too many requests from this IP, please try again later.',
        statusCode: 429,
        status: 'fail',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      securityLogger.rateLimitExceeded(req);
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests from this IP, please try again later.',
          statusCode: 429,
          status: 'fail',
        },
      });
    },
    skip: (req) => {
      // Skip rate limiting for health checks and monitoring
      return req.path === '/health' || req.path === '/status';
    },
  });

  // Stricter rate limiter for authentication routes
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
      success: false,
      error: {
        message: 'Too many authentication attempts, please try again later.',
        statusCode: 429,
        status: 'fail',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      securityLogger.rateLimitExceeded(req);
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many authentication attempts, please try again later.',
          statusCode: 429,
          status: 'fail',
        },
      });
    },
  });

  // Rate limiter for registration routes
  const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registration attempts per hour
    message: {
      success: false,
      error: {
        message: 'Too many registration attempts, please try again later.',
        statusCode: 429,
        status: 'fail',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      securityLogger.rateLimitExceeded(req);
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many registration attempts, please try again later.',
          statusCode: 429,
          status: 'fail',
        },
      });
    },
  });

  return {
    general: generalLimiter,
    auth: authLimiter,
    registration: registrationLimiter,
  };
};

/**
 * Speed limiter to slow down requests
 * Helps prevent brute force attacks by adding delays
 */
export const createSpeedLimiter = () => {
  return slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 50, // Allow 50 requests per 15 minutes without delay
    delayMs: 500, // Add 500ms delay per request after delayAfter
    maxDelayMs: 20000, // Maximum delay of 20 seconds
    skip: (req) => {
      // Skip speed limiting for health checks
      return req.path === '/health' || req.path === '/status';
    },
  });
};

/**
 * CORS configuration
 * Controls cross-origin resource sharing
 */
export const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = config.security.corsOrigin === '*' 
      ? ['*'] 
      : config.security.corsOrigin.split(',').map(o => o.trim());
    
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from unauthorized origin', {
        origin,
        allowedOrigins,
      });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 86400, // 24 hours
};

/**
 * Helmet configuration for security headers
 * Protects against various web vulnerabilities
 */
export const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
};

/**
 * Input sanitization middleware
 * Removes potentially dangerous content from request data
 */
export const sanitizeInput = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query) {
    sanitizeObject(req.query);
  }
  
  // Sanitize URL parameters
  if (req.params) {
    sanitizeObject(req.params);
  }
  
  next();
};

/**
 * Recursively sanitize object properties
 * Removes dangerous characters and patterns
 */
const sanitizeObject = (obj) => {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (typeof obj[key] === 'string') {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  }
};

/**
 * Sanitize individual string values
 * Removes potentially dangerous content
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  
  return str
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove other potentially dangerous HTML tags
    .replace(/<(iframe|object|embed|form|input|textarea|select|button)[^>]*>/gi, '')
    // Remove javascript: URLs
    .replace(/javascript:/gi, '')
    // Remove data: URLs (except for images)
    .replace(/data:(?!image\/)/gi, '')
    // Trim whitespace
    .trim();
};

/**
 * Request ID middleware
 * Adds unique request ID for tracking and debugging
 */
export const addRequestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || generateRequestId();
  res.setHeader('X-Request-ID', req.id);
  next();
};

/**
 * Generate unique request ID
 */
const generateRequestId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Security headers middleware
 * Adds additional security headers
 */
export const securityHeaders = (req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

/**
 * Request size limiter
 * Prevents large payload attacks
 */
export const limitRequestSize = (req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'], 10);
  
  if (contentLength > config.upload.maxFileSize) {
    return res.status(413).json({
      success: false,
      error: {
        message: 'Request entity too large',
        statusCode: 413,
        status: 'fail',
      },
    });
  }
  
  next();
};

/**
 * IP address extraction middleware
 * Ensures proper IP address detection behind proxies
 */
export const extractRealIP = (req, res, next) => {
  req.realIP = 
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown';
  
  next();
};

/**
 * Security monitoring middleware
 * Logs security-related events
 */
export const securityMonitoring = (req, res, next) => {
  // Log suspicious requests
  const suspiciousPatterns = [
    /\.\.\//, // Directory traversal
    /<script/i, // Script injection
    /javascript:/i, // JavaScript injection
    /union\s+select/i, // SQL injection
    /eval\s*\(/i, // Code injection
  ];
  
  const requestString = JSON.stringify({
    url: req.originalUrl,
    body: req.body,
    query: req.query,
    params: req.params,
  });
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(requestString)) {
      securityLogger.unauthorizedAccess(req, 'Suspicious pattern detected');
      break;
    }
  }
  
  next();
};

/**
 * Apply all security middleware
 * Centralized function to apply all security measures
 */
export const applySecurityMiddleware = (app) => {
  const limiters = createRateLimiters();
  
  // Apply rate limiters
  app.use('/api/auth', limiters.auth);
  app.use('/api/register', limiters.registration);
  app.use('/api', limiters.general);
  
  // Apply speed limiter
  app.use(createSpeedLimiter());
  
  // Apply security headers
  app.use(helmet(helmetConfig));
  app.use(securityHeaders);
  
  // Apply CORS
  app.use(cors(corsOptions));
  
  // Apply input sanitization
  app.use(mongoSanitize()); // Prevent NoSQL injection
  app.use(hpp()); // Prevent HTTP Parameter Pollution
  app.use(xss()); // Prevent XSS attacks
  app.use(sanitizeInput);
  
  // Apply other security middleware
  app.use(addRequestId);
  app.use(extractRealIP);
  app.use(limitRequestSize);
  app.use(securityMonitoring);
  
  logger.info('Security middleware applied successfully');
};

export default {
  createRateLimiters,
  createSpeedLimiter,
  corsOptions,
  helmetConfig,
  sanitizeInput,
  addRequestId,
  securityHeaders,
  limitRequestSize,
  extractRealIP,
  securityMonitoring,
  applySecurityMiddleware,
}; 