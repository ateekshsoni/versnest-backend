/**
 * 🔐 ENHANCED AUTHENTICATION MIDDLEWARE
 * 
 * This middleware system provides comprehensive authentication and authorization
 * with JWT refresh tokens, role-based access control, and security features.
 * 
 * Key Features:
 * - JWT access and refresh token validation
 * - Role-based authorization (RBAC)
 * - Rate limiting per user
 * - Account lockout protection
 * - Session management
 * - Security logging
 * 
 * Learning Points:
 * - Middleware chaining for complex auth flows
 * - Security best practices implementation
 * - Error handling in middleware
 * - Performance optimization with caching
 */

import jwt from 'jsonwebtoken';
import { CONFIG } from '../config/index.js';
import { appLogger } from '../utils/logger.js';
import { 
  AuthenticationError, 
  AuthorizationError, 
  ErrorFactory 
} from '../utils/errors.js';
import User from '../models/User.js';
import Token from '../models/Token.js';

/**
 * 🔍 JWT Token Verification Utility
 */
const verifyToken = (token, secret) => {
  try {
    return jwt.verify(token, secret, {
      issuer: CONFIG.jwt.issuer,
      audience: CONFIG.jwt.audience,
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ErrorFactory.authentication('Access token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw ErrorFactory.authentication('Invalid access token');
    }
    throw ErrorFactory.authentication('Token verification failed');
  }
};

/**
 * 🔐 Extract Token from Request
 */
const extractToken = (req) => {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check cookies
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }
  
  return null;
};

/**
 * 🛡️ Main Authentication Middleware
 * 
 * Validates JWT access tokens and attaches user info to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Extract token from request
    const token = extractToken(req);
    
    if (!token) {
      throw ErrorFactory.authentication('Access token required');
    }
    
    // Check if token is blacklisted
    const isBlacklisted = await Token.isBlacklisted(token);
    if (isBlacklisted) {
      throw ErrorFactory.authentication('Token has been revoked');
    }
    
    // Verify JWT token
    const decoded = verifyToken(token, CONFIG.jwt.secret);
    
    // Find user and check if account is active
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      throw ErrorFactory.authentication('User not found');
    }
    
    // Check if user is active
    if (!user.isActive || user.deletedAt) {
      throw ErrorFactory.authentication('Account is deactivated');
    }
    
    // Check if user is banned
    if (user.isCurrentlyBanned) {
      throw ErrorFactory.authorization('Account is banned');
    }
    
    // Check if account is locked
    if (user.isLocked) {
      throw ErrorFactory.authorization('Account is temporarily locked');
    }
    
    // Attach user to request
    req.user = user;
    req.token = token;
    
    // Update last active timestamp
    user.lastActive = new Date();
    await user.save();
    
    // Log successful authentication
    appLogger.logAuth('access_granted', {
      userId: user._id,
      userRole: user.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    
    next();
    
  } catch (error) {
    // Log failed authentication attempt
    appLogger.logAuth('access_denied', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      token: req.token ? '[REDACTED]' : 'none',
    });
    
    next(error);
  }
};

/**
 * 🔓 Optional Authentication Middleware
 * 
 * Adds user info if token is present, but doesn't require authentication
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (token) {
      // Check if token is blacklisted
      const isBlacklisted = await Token.isBlacklisted(token);
      if (!isBlacklisted) {
        // Verify token
        const decoded = verifyToken(token, CONFIG.jwt.secret);
        
        // Find user
        const user = await User.findById(decoded.id).select('-password');
        if (user && user.isActive && !user.deletedAt && !user.isCurrentlyBanned) {
          req.user = user;
          req.token = token;
        }
      }
    }
    
    next();
  } catch (error) {
    // In optional auth, we don't fail on invalid tokens
    appLogger.debug('Optional auth failed', { error: error.message });
    next();
  }
};

/**
 * 👥 Role-based Authorization Middleware Factory
 * 
 * Creates middleware to check if user has required role(s)
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw ErrorFactory.authentication('Authentication required');
      }
      
      // Check if user has required role
      if (!roles.includes(req.user.role)) {
        throw ErrorFactory.authorization(
          `Access denied. Required role(s): ${roles.join(', ')}`
        );
      }
      
      // Log authorization success
      appLogger.logAuth('authorization_granted', {
        userId: req.user._id,
        userRole: req.user.role,
        requiredRoles: roles,
        resource: req.originalUrl,
      });
      
      next();
      
    } catch (error) {
      // Log authorization failure
      appLogger.logAuth('authorization_denied', {
        userId: req.user?._id,
        userRole: req.user?.role,
        requiredRoles: roles,
        resource: req.originalUrl,
        error: error.message,
      });
      
      next(error);
    }
  };
};

/**
 * 👑 Admin Only Middleware
 */
export const adminOnly = authorize('admin');

/**
 * ✍️ Writer Only Middleware
 */
export const writerOnly = authorize('writer');

/**
 * 📖 Reader Only Middleware
 */
export const readerOnly = authorize('reader');

/**
 * 📝 Writer or Admin Middleware
 */
export const writerOrAdmin = authorize('writer', 'admin');

/**
 * 🔐 Resource Owner or Admin Middleware Factory
 * 
 * Checks if user owns the resource or is an admin
 */
export const ownerOrAdmin = (resourceModel, resourceIdParam = 'id', ownerField = 'author') => {
  return async (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw ErrorFactory.authentication('Authentication required');
      }
      
      // Admin can access everything
      if (req.user.role === 'admin') {
        return next();
      }
      
      // Get resource ID from request params
      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        throw ErrorFactory.validation('Resource ID is required');
      }
      
      // Find the resource
      const resource = await resourceModel.findById(resourceId);
      if (!resource) {
        throw ErrorFactory.notFound('Resource');
      }
      
      // Check if user owns the resource
      const ownerId = resource[ownerField];
      if (!ownerId || !ownerId.equals(req.user._id)) {
        throw ErrorFactory.authorization('Access denied. You can only access your own resources.');
      }
      
      // Attach resource to request for use in controller
      req.resource = resource;
      
      next();
      
    } catch (error) {
      next(error);
    }
  };
};

/**
 * 🔄 Refresh Token Middleware
 * 
 * Validates refresh tokens for token refresh endpoint
 */
export const validateRefreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    
    if (!refreshToken) {
      throw ErrorFactory.authentication('Refresh token required');
    }
    
    // Find and validate refresh token in database
    const tokenDoc = await Token.findValidToken(refreshToken, 'refresh');
    if (!tokenDoc) {
      throw ErrorFactory.authentication('Invalid or expired refresh token');
    }
    
    // Verify JWT signature
    const decoded = verifyToken(refreshToken, CONFIG.jwt.refreshSecret);
    
    // Check if user exists and is active
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive || user.deletedAt) {
      throw ErrorFactory.authentication('User account is not active');
    }
    
    // Update token usage
    await tokenDoc.use();
    
    // Attach user and token to request
    req.user = user;
    req.refreshToken = refreshToken;
    req.tokenDoc = tokenDoc;
    
    next();
    
  } catch (error) {
    appLogger.logAuth('refresh_token_validation_failed', {
      error: error.message,
      ip: req.ip,
    });
    
    next(error);
  }
};

/**
 * 🚫 Account Status Validation Middleware
 * 
 * Additional checks for account status (used in sensitive operations)
 */
export const validateAccountStatus = async (req, res, next) => {
  try {
    if (!req.user) {
      throw ErrorFactory.authentication('Authentication required');
    }
    
    const user = await User.findById(req.user._id);
    if (!user) {
      throw ErrorFactory.authentication('User not found');
    }
    
    // Check if account is verified (if verification is required)
    if (!user.isVerified && CONFIG.features?.requireEmailVerification) {
      throw ErrorFactory.authorization('Email verification required');
    }
    
    // Check for recent password change (security measure)
    const passwordChangedRecently = user.passwordChangedAt && 
      (Date.now() - user.passwordChangedAt.getTime()) < 300000; // 5 minutes
    
    if (passwordChangedRecently) {
      throw ErrorFactory.authorization('Please log in again after password change');
    }
    
    next();
    
  } catch (error) {
    next(error);
  }
};

/**
 * 📊 Rate Limiting by User
 * 
 * Implements per-user rate limiting for additional security
 */
export const userRateLimit = (maxRequests = 100, windowMs = 900000) => {
  const userRequestCounts = new Map();
  
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const userId = req.user._id.toString();
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Get user's request history
    let userRequests = userRequestCounts.get(userId) || [];
    
    // Filter out old requests
    userRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (userRequests.length >= maxRequests) {
      appLogger.logSecurity('user_rate_limit_exceeded', 'medium', {
        userId,
        requestCount: userRequests.length,
        maxRequests,
        windowMs,
      });
      
      throw ErrorFactory.rateLimit(
        `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs/1000} seconds`,
        Math.ceil(windowMs / 1000)
      );
    }
    
    // Add current request
    userRequests.push(now);
    userRequestCounts.set(userId, userRequests);
    
    next();
  };
};

/**
 * 🔐 Session Management Middleware
 * 
 * Manages user sessions and concurrent login limits
 */
export const sessionManagement = (maxConcurrentSessions = 5) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next();
      }
      
      // Get user's active sessions
      const activeSessions = await Token.getUserActiveSessions(req.user._id);
      
      // Check concurrent session limit
      if (activeSessions.length > maxConcurrentSessions) {
        // Revoke oldest sessions
        const sessionsToRevoke = activeSessions.slice(maxConcurrentSessions);
        
        for (const session of sessionsToRevoke) {
          await session.revoke('concurrent_limit_exceeded');
        }
        
        appLogger.logSecurity('concurrent_sessions_limited', 'medium', {
          userId: req.user._id,
          revokedSessions: sessionsToRevoke.length,
          maxConcurrentSessions,
        });
      }
      
      next();
      
    } catch (error) {
      next(error);
    }
  };
};

/**
 * 🎯 Permission-based Authorization
 * 
 * More granular permission system (for future expansion)
 */
export const hasPermission = (permission) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw ErrorFactory.authentication('Authentication required');
      }
      
      // Basic role-based permissions
      const rolePermissions = {
        admin: ['*'], // Admin has all permissions
        writer: ['post:create', 'post:update', 'post:delete', 'comment:create'],
        reader: ['comment:create', 'post:like', 'post:bookmark'],
      };
      
      const userPermissions = rolePermissions[req.user.role] || [];
      
      // Check if user has permission or wildcard permission
      if (!userPermissions.includes(permission) && !userPermissions.includes('*')) {
        throw ErrorFactory.authorization(`Permission denied: ${permission}`);
      }
      
      next();
      
    } catch (error) {
      next(error);
    }
  };
};

/**
 * 🔒 Security Headers Middleware
 * 
 * Adds security-related headers to responses
 */
export const securityHeaders = (req, res, next) => {
  // Add security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  });
  
  next();
};

// Export all middleware functions
export default {
  authenticate,
  optionalAuth,
  authorize,
  adminOnly,
  writerOnly,
  readerOnly,
  writerOrAdmin,
  ownerOrAdmin,
  validateRefreshToken,
  validateAccountStatus,
  userRateLimit,
  sessionManagement,
  hasPermission,
  securityHeaders,
};
