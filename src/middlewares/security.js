/**
 * 🛡️ ADVANCED SECURITY MIDDLEWARE
 * 
 * This module provides comprehensive security middleware for protecting
 * the application against common web vulnerabilities and attacks.
 * 
 * Security Features:
 * - Rate limiting with multiple strategies
 * - CORS configuration
 * - Request sanitization
 * - Security headers
 * - Attack detection and prevention
 * - IP-based security measures
 * 
 * Learning Points:
 * - Defense in depth security strategy
 * - OWASP security best practices
 * - Rate limiting algorithms
 * - Attack pattern recognition
 */

import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import { CONFIG } from '../config/index.js';
import { appLogger } from '../utils/logger.js';
import { ErrorFactory } from '../utils/errors.js';

/**
 * 🚦 Advanced Rate Limiting Configuration
 */

// General API rate limiting
export const generalRateLimit = rateLimit({
  windowMs: CONFIG.rateLimit.windowMs,
  max: CONFIG.rateLimit.max,
  message: {
    error: {
      name: 'RateLimitError',
      message: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(CONFIG.rateLimit.windowMs / 1000),
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    appLogger.logSecurity('rate_limit_exceeded', 'medium', {
      ip: req.ip,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
      limit: CONFIG.rateLimit.max,
      windowMs: CONFIG.rateLimit.windowMs,
    });
    
    res.status(429).json({
      error: {
        name: 'RateLimitError',
        message: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(CONFIG.rateLimit.windowMs / 1000),
      }
    });
  },
});

// Strict rate limiting for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  skipSuccessfulRequests: true, // Don't count successful requests
  message: {
    error: {
      name: 'AuthRateLimitError',
      message: 'Too many authentication attempts, please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    }
  },
  handler: (req, res) => {
    appLogger.logSecurity('auth_rate_limit_exceeded', 'high', {
      ip: req.ip,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
    });
    
    res.status(429).json({
      error: {
        name: 'AuthRateLimitError',
        message: 'Too many authentication attempts, please try again later.',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        retryAfter: 900, // 15 minutes
      }
    });
  },
});

// Password reset rate limiting
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: {
    error: {
      name: 'PasswordResetRateLimitError',
      message: 'Too many password reset attempts, please try again later.',
      code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
    }
  },
});

// Content creation rate limiting
export const contentRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit content creation to 5 per minute
  message: {
    error: {
      name: 'ContentRateLimitError',
      message: 'Too many content creation attempts, please slow down.',
      code: 'CONTENT_RATE_LIMIT_EXCEEDED',
    }
  },
});

/**
 * 🧹 Request Sanitization Middleware
 */

// MongoDB injection protection
export const mongoSanitization = mongoSanitize({
  allowDots: true,
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    appLogger.logSecurity('mongo_injection_attempt', 'high', {
      ip: req.ip,
      url: req.originalUrl,
      sanitizedKey: key,
      userAgent: req.get('User-Agent'),
    });
  },
});

// HTTP Parameter Pollution protection
export const parameterPollutionProtection = hpp({
  whitelist: ['tags', 'genres', 'sort'], // Allow arrays for these parameters
});

/**
 * 🛡️ Advanced Security Headers
 */
export const advancedSecurityHeaders = (req, res, next) => {
  // Content Security Policy
  res.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  
  // Additional security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  
  next();
};

/**
 * 🔍 Suspicious Activity Detection
 */
export const suspiciousActivityDetection = () => {
  const suspiciousPatterns = [
    /\b(union|select|insert|update|delete|drop|create|alter|exec|script)\b/i,
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,
  ];
  
  const ipSuspiciousActivity = new Map();
  
  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowMs = 10 * 60 * 1000; // 10 minutes
    
    // Check request content for suspicious patterns
    const requestContent = JSON.stringify({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    
    let suspiciousScore = 0;
    const detectedPatterns = [];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(requestContent)) {
        suspiciousScore += 1;
        detectedPatterns.push(pattern.source);
      }
    }
    
    // Track suspicious activity per IP
    if (suspiciousScore > 0) {
      const ipActivity = ipSuspiciousActivity.get(ip) || [];
      ipActivity.push({ timestamp: now, score: suspiciousScore, patterns: detectedPatterns });
      
      // Clean old entries
      const filteredActivity = ipActivity.filter(activity => 
        now - activity.timestamp < windowMs
      );
      
      ipSuspiciousActivity.set(ip, filteredActivity);
      
      // Calculate total suspicious score in window
      const totalScore = filteredActivity.reduce((sum, activity) => sum + activity.score, 0);
      
      appLogger.logSecurity('suspicious_activity_detected', 'high', {
        ip,
        url: req.originalUrl,
        method: req.method,
        suspiciousScore,
        totalScore,
        detectedPatterns,
        userAgent: req.get('User-Agent'),
      });
      
      // Block if score is too high
      if (totalScore >= 10) {
        appLogger.logSecurity('ip_blocked_suspicious_activity', 'critical', {
          ip,
          totalScore,
          recentActivity: filteredActivity.length,
        });
        
        return res.status(403).json({
          error: {
            name: 'SuspiciousActivityError',
            message: 'Suspicious activity detected. Access denied.',
            code: 'SUSPICIOUS_ACTIVITY_BLOCKED',
          }
        });
      }
    }
    
    next();
  };
};

/**
 * 🚫 IP Blocking Middleware
 */
export const ipBlockingMiddleware = () => {
  const blockedIPs = new Set();
  const ipAttempts = new Map();
  
  return (req, res, next) => {
    const ip = req.ip;
    
    // Check if IP is blocked
    if (blockedIPs.has(ip)) {
      appLogger.logSecurity('blocked_ip_access_attempt', 'critical', {
        ip,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
      });
      
      return res.status(403).json({
        error: {
          name: 'IPBlockedError',
          message: 'Access denied. Your IP has been blocked.',
          code: 'IP_BLOCKED',
        }
      });
    }
    
    // Track failed attempts
    res.on('finish', () => {
      if (res.statusCode === 401 || res.statusCode === 403) {
        const attempts = ipAttempts.get(ip) || 0;
        ipAttempts.set(ip, attempts + 1);
        
        // Block IP after too many failed attempts
        if (attempts >= 50) {
          blockedIPs.add(ip);
          
          appLogger.logSecurity('ip_auto_blocked', 'critical', {
            ip,
            attempts: attempts + 1,
          });
          
          // Auto-unblock after 24 hours
          setTimeout(() => {
            blockedIPs.delete(ip);
            ipAttempts.delete(ip);
            
            appLogger.logSecurity('ip_auto_unblocked', 'medium', { ip });
          }, 24 * 60 * 60 * 1000);
        }
      }
    });
    
    next();
  };
};

/**
 * 📊 Request Size Limiting
 */
export const requestSizeLimit = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const maxSizeBytes = parseSize(maxSize);
    
    if (contentLength > maxSizeBytes) {
      appLogger.logSecurity('request_size_limit_exceeded', 'medium', {
        ip: req.ip,
        contentLength,
        maxSize: maxSizeBytes,
        url: req.originalUrl,
      });
      
      return res.status(413).json({
        error: {
          name: 'RequestSizeLimitError',
          message: `Request size exceeds limit of ${maxSize}`,
          code: 'REQUEST_SIZE_LIMIT_EXCEEDED',
        }
      });
    }
    
    next();
  };
};

/**
 * 🔒 HTTPS Enforcement
 */
export const httpsEnforcement = (req, res, next) => {
  if (CONFIG.isProduction && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    appLogger.logSecurity('http_request_in_production', 'medium', {
      ip: req.ip,
      url: req.originalUrl,
    });
    
    return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
  }
  
  next();
};

/**
 * 🕵️ User Agent Validation
 */
export const userAgentValidation = (req, res, next) => {
  const userAgent = req.get('User-Agent');
  
  // Block requests without user agent
  if (!userAgent) {
    appLogger.logSecurity('missing_user_agent', 'medium', {
      ip: req.ip,
      url: req.originalUrl,
    });
    
    return res.status(400).json({
      error: {
        name: 'MissingUserAgentError',
        message: 'User agent is required',
        code: 'MISSING_USER_AGENT',
      }
    });
  }
  
  // Block known malicious user agents
  const maliciousPatterns = [
    /sqlmap/i,
    /nikto/i,
    /masscan/i,
    /nmap/i,
    /dirb/i,
    /dirbuster/i,
  ];
  
  for (const pattern of maliciousPatterns) {
    if (pattern.test(userAgent)) {
      appLogger.logSecurity('malicious_user_agent_detected', 'high', {
        ip: req.ip,
        userAgent,
        url: req.originalUrl,
      });
      
      return res.status(403).json({
        error: {
          name: 'MaliciousUserAgentError',
          message: 'Access denied',
          code: 'MALICIOUS_USER_AGENT',
        }
      });
    }
  }
  
  next();
};

/**
 * 🔧 Utility Functions
 */
const parseSize = (size) => {
  const units = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  
  const match = size.toString().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmg]?b)$/);
  if (!match) return 0;
  
  const [, number, unit] = match;
  return parseFloat(number) * (units[unit] || 1);
};

// Export security middleware
export default {
  generalRateLimit,
  authRateLimit,
  passwordResetRateLimit,
  contentRateLimit,
  mongoSanitization,
  parameterPollutionProtection,
  advancedSecurityHeaders,
  suspiciousActivityDetection,
  ipBlockingMiddleware,
  requestSizeLimit,
  httpsEnforcement,
  userAgentValidation,
};
