/**
 * @fileoverview Enhanced authentication middleware
 * Provides JWT token validation, user authentication, and authorization
 * Includes token blacklisting, refresh tokens, and security features
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { AuthenticationError, AuthorizationError } from '../errors/index.js';
import BlacklistToken from '../models/blacklistToken.model.js';
import Reader from '../models/reader.model.js';
import Writer from '../models/writer.model.js';

/**
 * Extract JWT token from request
 * Supports multiple token sources (headers, cookies, query params)
 */
const extractToken = (req) => {
  // Check Authorization header (Bearer token)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return req.headers.authorization.split(' ')[1];
  }
  
  // Check cookies
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  
  // Check query parameters (for email verification, etc.)
  if (req.query?.token) {
    return req.query.token;
  }
  
  return null;
};

/**
 * Verify JWT token and return decoded payload
 * Includes comprehensive error handling and logging
 */
const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    return { valid: true, decoded };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { valid: false, error: 'Token expired' };
    }
    if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid token' };
    }
    return { valid: false, error: 'Token verification failed' };
  }
};

/**
 * Check if token is blacklisted
 * Prevents token reuse after logout
 */
const isTokenBlacklisted = async (token) => {
  try {
    const blacklistedToken = await BlacklistToken.findOne({ token });
    return !!blacklistedToken;
  } catch (error) {
    logger.error('Error checking token blacklist', { error: error.message });
    return false;
  }
};

/**
 * Generic authentication middleware
 * Can be used for both readers and writers
 */
const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }
    
    // Check if token is blacklisted
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      throw new AuthenticationError('Token has been revoked');
    }
    
    // Verify token
    const { valid, decoded, error } = verifyToken(token);
    if (!valid) {
      throw new AuthenticationError(error || 'Invalid token');
    }
    
    // Store token info in request
    req.token = token;
    req.tokenPayload = decoded;
    
    next();
  } catch (error) {
    logger.warn('Authentication failed', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      error: error.message,
    });
    next(error);
  }
};

/**
 * Reader-specific authentication middleware
 */
export const authenticateReader = async (req, res, next) => {
  try {
    await authenticate(req, res, async () => {
      const reader = await Reader.findById(req.tokenPayload._id)
        .select('-password')
        .lean();
      
      if (!reader) {
        throw new AuthenticationError('Reader not found');
      }
      
      req.user = reader;
      req.userType = 'reader';
      next();
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Writer-specific authentication middleware
 */
export const authenticateWriter = async (req, res, next) => {
  try {
    await authenticate(req, res, async () => {
      const writer = await Writer.findById(req.tokenPayload._id)
        .select('-password')
        .lean();
      
      if (!writer) {
        throw new AuthenticationError('Writer not found');
      }
      
      req.user = writer;
      req.userType = 'writer';
      next();
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication middleware
 * Doesn't fail if no token is provided, but attaches user if valid token exists
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return next();
    }
    
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return next();
    }
    
    const { valid, decoded } = verifyToken(token);
    if (!valid) {
      return next();
    }
    
    req.token = token;
    req.tokenPayload = decoded;
    
    // Try to find user (reader or writer)
    let user = await Reader.findById(decoded._id).select('-password').lean();
    if (user) {
      req.user = user;
      req.userType = 'reader';
    } else {
      user = await Writer.findById(decoded._id).select('-password').lean();
      if (user) {
        req.user = user;
        req.userType = 'writer';
      }
    }
    
    next();
  } catch (error) {
    // Don't fail on optional auth errors
    next();
  }
};

/**
 * Role-based authorization middleware
 * Checks if user has required role or permissions
 */
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }
    
    const userRole = req.userType;
    if (!roles.includes(userRole)) {
      logger.warn('Unauthorized access attempt', {
        userId: req.user._id,
        userRole,
        requiredRoles: roles,
        url: req.originalUrl,
        ip: req.ip,
      });
      return next(new AuthorizationError('Insufficient permissions'));
    }
    
    next();
  };
};

/**
 * Resource ownership middleware
 * Ensures user can only access their own resources
 */
export const requireOwnership = (resourceModel, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AuthenticationError('Authentication required'));
      }
      
      const resourceId = req.params[resourceIdParam];
      const resource = await resourceModel.findById(resourceId);
      
      if (!resource) {
        return next(new Error('Resource not found'));
      }
      
      // Check if user owns the resource
      if (resource.userId?.toString() !== req.user._id.toString()) {
        logger.warn('Unauthorized resource access attempt', {
          userId: req.user._id,
          resourceId,
          resourceOwner: resource.userId,
          url: req.originalUrl,
          ip: req.ip,
        });
        return next(new AuthorizationError('Access denied'));
      }
      
      req.resource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Password validation middleware
 * Validates password strength and complexity
 */
export const validatePassword = (password) => {
  const minLength = 8;
  const maxLength = 128;
  
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required');
  }
  
  if (password.length < minLength) {
    throw new Error(`Password must be at least ${minLength} characters long`);
  }
  
  if (password.length > maxLength) {
    throw new Error(`Password must be no more than ${maxLength} characters long`);
  }
  
  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    throw new Error('Password must contain at least one uppercase letter');
  }
  
  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    throw new Error('Password must contain at least one lowercase letter');
  }
  
  // Check for at least one number
  if (!/\d/.test(password)) {
    throw new Error('Password must contain at least one number');
  }
  
  // Check for at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    throw new Error('Password must contain at least one special character');
  }
  
  return true;
};

/**
 * Hash password with bcrypt
 * Uses configurable salt rounds
 */
export const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 * Used for login validation
 */
export const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

/**
 * Blacklist token (logout functionality)
 * Prevents token reuse after logout
 */
export const blacklistToken = async (token) => {
  try {
    await BlacklistToken.create({ token });
    logger.info('Token blacklisted successfully');
    return true;
  } catch (error) {
    logger.error('Error blacklisting token', { error: error.message });
    return false;
  }
};

/**
 * Generate JWT token with user information
 * Creates tokens with proper payload structure
 */
export const generateToken = (payload, expiresIn = config.jwt.expiresIn) => {
  return jwt.sign(payload, config.jwt.secret, { expiresIn });
};

/**
 * Generate refresh token
 * Used for token renewal without re-authentication
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwt.refreshSecret, { 
    expiresIn: config.jwt.refreshExpiresIn 
  });
};

/**
 * Logout utility
 * Clears cookies and blacklists token
 */
export const logout = async (req, res) => {
  try {
    const token = extractToken(req);
    
    if (token) {
      await blacklistToken(token);
    }
    
    // Clear cookies
    res.clearCookie('token', {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
    });
    
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
    });
    
    return { success: true, message: 'Logged out successfully' };
  } catch (error) {
    logger.error('Logout error', { error: error.message });
    throw error;
  }
};

export default {
  authenticateReader,
  authenticateWriter,
  optionalAuth,
  requireRole,
  requireOwnership,
  validatePassword,
  hashPassword,
  comparePassword,
  blacklistToken,
  generateToken,
  generateRefreshToken,
  logout,
}; 