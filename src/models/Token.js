/**
 * 🔐 TOKEN MODEL
 * 
 * This model manages refresh tokens and blacklisted tokens for JWT authentication.
 * It provides secure token management with automatic cleanup and security features.
 * 
 * Key Features:
 * - Refresh token storage and validation
 * - Token blacklisting for logout/revocation
 * - Automatic token cleanup (TTL)
 * - Security tracking and logging
 * - Device/session management
 * 
 * Learning Points:
 * - Refresh tokens improve security over long-lived access tokens
 * - Token blacklisting prevents replay attacks
 * - TTL indexes automatically clean up expired tokens
 * - Device tracking helps with security monitoring
 */

const mongoose = require('mongoose');
const { CONFIG } = require('../config/index.js');
const { appLogger } = require('../utils/logger.js');

/**
 * 📋 Token Schema Definition
 */
const tokenSchema = new mongoose.Schema({
  // Token Information
  token: {
    type: String,
    required: [true, 'Token is required'],
    unique: true,
  },
  
  tokenType: {
    type: String,
    enum: ['refresh', 'blacklist', 'reset_password', 'email_verification'],
    required: [true, 'Token type is required'],
  },
  
  // User Reference
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
  },
  
  // Token Metadata
  isActive: {
    type: Boolean,
    default: true,
  },
  
  // Expiration (TTL will be set based on token type)
  expiresAt: {
    type: Date,
    required: [true, 'Expiration date is required'],
  },
  
  // Security Information
  deviceInfo: {
    userAgent: String,
    ipAddress: String,
    platform: String,
    browser: String,
    os: String,
  },
  
  // Session Information
  sessionId: {
    type: String,
  },
  
  // Usage Tracking
  lastUsedAt: {
    type: Date,
    default: Date.now,
  },
  
  usageCount: {
    type: Number,
    default: 0,
  },
  
  // Revocation Information
  revokedAt: {
    type: Date,
  },
  
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  revocationReason: {
    type: String,
    enum: ['logout', 'security_breach', 'admin_action', 'password_change', 'expired', 'other'],
  },
  
  // Additional metadata for specific token types
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  
}, {
  timestamps: true, // createdAt, updatedAt
  toJSON: { 
    transform: function(doc, ret) {
      // Remove sensitive information from JSON output
      delete ret.token;
      delete ret.__v;
      return ret;
    }
  }
});

/**
 * 🔗 Indexes for Performance and Security
 */
tokenSchema.index({ token: 1, tokenType: 1 });
tokenSchema.index({ user: 1, tokenType: 1, isActive: 1 });
tokenSchema.index({ sessionId: 1, isActive: 1 });
tokenSchema.index({ user: 1, createdAt: -1 });

// TTL index for automatic cleanup of expired tokens
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * 📊 Virtual Properties
 */

// Check if token is expired
tokenSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Check if token is revoked
tokenSchema.virtual('isRevoked').get(function() {
  return !!this.revokedAt;
});

// Check if token is valid (active, not expired, not revoked)
tokenSchema.virtual('isValid').get(function() {
  return this.isActive && !this.isExpired && !this.isRevoked;
});

/**
 * 🔒 Pre-save Middleware
 */
tokenSchema.pre('save', function(next) {
  // Set expiration based on token type if not already set
  if (this.isNew && !this.expiresAt) {
    const now = new Date();
    
    switch (this.tokenType) {
      case 'refresh':
        // Refresh tokens expire in 7 days by default
        this.expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'blacklist':
        // Blacklist tokens expire when the original token would expire
        this.expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'reset_password':
        // Password reset tokens expire in 1 hour
        this.expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case 'email_verification':
        // Email verification tokens expire in 24 hours
        this.expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      default:
        // Default to 1 hour
        this.expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    }
  }
  
  next();
});

/**
 * 🔒 Post-save Middleware
 */
tokenSchema.post('save', function(doc) {
  // Log token creation for security monitoring
  if (doc.isNew) {
    appLogger.logSecurity('token_created', 'low', {
      tokenType: doc.tokenType,
      userId: doc.user,
      sessionId: doc.sessionId,
      expiresAt: doc.expiresAt,
      deviceInfo: doc.deviceInfo,
    });
  }
});

/**
 * 🔐 Instance Methods
 */

// Use/refresh the token
tokenSchema.methods.use = async function() {
  if (!this.isValid) {
    throw new Error('Token is not valid');
  }
  
  this.lastUsedAt = new Date();
  this.usageCount += 1;
  
  await this.save();
  
  appLogger.logSecurity('token_used', 'low', {
    tokenId: this._id,
    tokenType: this.tokenType,
    userId: this.user,
    usageCount: this.usageCount,
  });
  
  return this;
};

// Revoke the token
tokenSchema.methods.revoke = async function(reason = 'other', revokedBy = null) {
  this.isActive = false;
  this.revokedAt = new Date();
  this.revocationReason = reason;
  
  if (revokedBy) {
    this.revokedBy = revokedBy;
  }
  
  await this.save();
  
  appLogger.logSecurity('token_revoked', 'medium', {
    tokenId: this._id,
    tokenType: this.tokenType,
    userId: this.user,
    reason,
    revokedBy,
  });
  
  return this;
};

// Extend token expiration
tokenSchema.methods.extend = async function(additionalTime) {
  if (!this.isValid) {
    throw new Error('Cannot extend invalid token');
  }
  
  this.expiresAt = new Date(this.expiresAt.getTime() + additionalTime);
  await this.save();
  
  appLogger.logSecurity('token_extended', 'low', {
    tokenId: this._id,
    tokenType: this.tokenType,
    userId: this.user,
    newExpiresAt: this.expiresAt,
  });
  
  return this;
};

/**
 * 🔍 Static Methods
 */

// Find valid token by token string
tokenSchema.statics.findValidToken = function(tokenString, tokenType = null) {
  const filter = {
    token: tokenString,
    isActive: true,
    expiresAt: { $gt: new Date() },
    revokedAt: { $exists: false }
  };
  
  if (tokenType) {
    filter.tokenType = tokenType;
  }
  
  return this.findOne(filter).populate('user');
};

// Create a new token
tokenSchema.statics.createToken = async function(tokenData) {
  const {
    token,
    tokenType,
    user,
    expiresAt,
    deviceInfo = {},
    sessionId,
    metadata = {}
  } = tokenData;
  
  // Check if token already exists (prevent duplicates)
  const existingToken = await this.findOne({ token });
  if (existingToken) {
    throw new Error('Token already exists');
  }
  
  const newToken = new this({
    token,
    tokenType,
    user,
    expiresAt,
    deviceInfo,
    sessionId,
    metadata,
  });
  
  await newToken.save();
  return newToken;
};

// Blacklist a token
tokenSchema.statics.blacklistToken = async function(tokenString, userId, reason = 'logout') {
  // Create blacklist entry
  const blacklistToken = new this({
    token: tokenString,
    tokenType: 'blacklist',
    user: userId,
    revocationReason: reason,
    isActive: false,
    revokedAt: new Date(),
  });
  
  await blacklistToken.save();
  
  // Also revoke the original token if it exists
  const originalToken = await this.findOne({ token: tokenString });
  if (originalToken) {
    await originalToken.revoke(reason);
  }
  
  return blacklistToken;
};

// Check if token is blacklisted
tokenSchema.statics.isBlacklisted = async function(tokenString) {
  const blacklistedToken = await this.findOne({
    token: tokenString,
    tokenType: 'blacklist'
  });
  
  return !!blacklistedToken;
};

// Clean up expired tokens (manual cleanup)
tokenSchema.statics.cleanupExpiredTokens = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
  
  appLogger.info('Cleaned up expired tokens', {
    deletedCount: result.deletedCount,
  });
  
  return result;
};

// Get user's active sessions
tokenSchema.statics.getUserActiveSessions = function(userId) {
  return this.find({
    user: userId,
    tokenType: 'refresh',
    isActive: true,
    expiresAt: { $gt: new Date() },
    revokedAt: { $exists: false }
  })
  .sort({ lastUsedAt: -1 })
  .select('-token'); // Don't include the actual token
};

// Revoke all user tokens (for security purposes)
tokenSchema.statics.revokeAllUserTokens = async function(userId, reason = 'security_breach', revokedBy = null) {
  const result = await this.updateMany(
    {
      user: userId,
      isActive: true,
      revokedAt: { $exists: false }
    },
    {
      $set: {
        isActive: false,
        revokedAt: new Date(),
        revocationReason: reason,
        revokedBy: revokedBy
      }
    }
  );
  
  appLogger.logSecurity('all_user_tokens_revoked', 'high', {
    userId,
    reason,
    revokedBy,
    revokedCount: result.modifiedCount,
  });
  
  return result;
};

// Get token statistics
tokenSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$tokenType',
        count: { $sum: 1 },
        active: { $sum: { $cond: ['$isActive', 1, 0] } },
        expired: { 
          $sum: { 
            $cond: [{ $lt: ['$expiresAt', new Date()] }, 1, 0] 
          } 
        },
        revoked: { 
          $sum: { 
            $cond: [{ $ne: ['$revokedAt', null] }, 1, 0] 
          } 
        }
      }
    }
  ]);
  
  return stats;
};

// Find tokens by session
tokenSchema.statics.findBySession = function(sessionId) {
  return this.find({
    sessionId,
    isActive: true,
    expiresAt: { $gt: new Date() }
  });
};

// Create the Token model
const Token = mongoose.model('Token', tokenSchema);

module.exports = Token;
