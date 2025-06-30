/**
 * 👤 UNIFIED USER MODEL
 * 
 * This model implements a unified user system with role-based access control.
 * Instead of separate Reader/Writer models, we use a single User model with
 * roles, which is more scalable and follows industry best practices.
 * 
 * Key Features:
 * - Role-based access control (RBAC)
 * - Account security features (login attempts, lockout)
 * - Profile customization based on role
 * - Social features (followers, following)
 * - Activity tracking
 * - Soft delete capability
 * 
 * Design Patterns:
 * - Single Table Inheritance: One model with role-based behavior
 * - Factory Pattern: Different user creation based on role
 * - Strategy Pattern: Different validation based on role
 * 
 * Learning Points:
 * - RBAC is more flexible than separate models
 * - Security features protect against common attacks
 * - Soft delete preserves data integrity
 * - Indexes improve query performance
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { CONFIG } = require('../config/index.js');
const { appLogger } = require('../utils/logger.js');

/**
 * 📋 User Schema Definition
 */
const userSchema = new mongoose.Schema({
  // Basic Information
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Full name must be at least 2 characters long'],
    maxlength: [100, 'Full name must not exceed 100 characters'],
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false, // Don't include in queries by default
  },
  
  // Role-based Information
  role: {
    type: String,
    enum: {
      values: ['reader', 'writer', 'admin'],
      message: 'Role must be either reader, writer, or admin'
    },
    required: [true, 'User role is required'],
  },
  
  // Profile Information
  avatar: {
    type: String,
    default: null,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Avatar must be a valid URL'
    }
  },
  
  bio: {
    type: String,
    maxlength: [500, 'Bio must not exceed 500 characters'],
    trim: true,
  },
  
  // Writer-specific fields
  penName: {
    type: String,
    trim: true,
    minlength: [2, 'Pen name must be at least 2 characters long'],
    maxlength: [50, 'Pen name must not exceed 50 characters'],
    // Only required for writers
    required: function() {
      return this.role === 'writer';
    },
  },
  
  // Genre preferences (for both readers and writers)
  genres: [{
    type: String,
    enum: [
      'Lyrical', 'Narrative', 'Sonnet', 'Haiku', 
      'Fantasy', 'Free Verse', 'Drama', 'Epic', 
      'Comedy', 'Romance', 'Mystery', 'Horror',
      'Science Fiction', 'Historical', 'Other'
    ],
  }],
  
  // Reader-specific mood preferences
  moodPreferences: [{
    type: String,
    enum: [
      'Reflective', 'Uplifting', 'Melancholic', 'Romantic',
      'Adventurous', 'Mystical', 'Humorous', 'Dramatic',
      'Peaceful', 'Energetic'
    ],
    // Only valid for readers
    validate: {
      validator: function(v) {
        return this.role !== 'reader' || v.length <= 5;
      },
      message: 'Readers can have at most 5 mood preferences'
    }
  }],
  
  // Social Features
  followers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    followedAt: {
      type: Date,
      default: Date.now,
    }
  }],
  
  following: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    followedAt: {
      type: Date,
      default: Date.now,
    }
  }],
  
  // Social Links
  socialLinks: {
    website: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Website must be a valid URL'
      }
    },
    twitter: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^@?[A-Za-z0-9_]{1,15}$/.test(v);
        },
        message: 'Invalid Twitter handle'
      }
    },
    instagram: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^@?[A-Za-z0-9_]{1,30}$/.test(v);
        },
        message: 'Invalid Instagram handle'
      }
    },
  },
  
  // Privacy Settings
  privacySettings: {
    profileVisibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    showEmail: {
      type: Boolean,
      default: false,
    },
    allowFollowers: {
      type: Boolean,
      default: true,
    },
  },
  
  // Security Features
  loginAttempts: {
    type: Number,
    default: 0,
  },
  
  lockUntil: {
    type: Date,
  },
  
  lastLogin: {
    type: Date,
  },
  
  lastActive: {
    type: Date,
    default: Date.now,
  },
  
  // Account Status
  isVerified: {
    type: Boolean,
    default: false,
  },
  
  isActive: {
    type: Boolean,
    default: true,
  },
  
  // Admin-specific fields
  isBanned: {
    type: Boolean,
    default: false,
  },
  
  banReason: {
    type: String,
  },
  
  banExpiresAt: {
    type: Date,
  },
  
  warnings: [{
    reason: String,
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    }
  }],
  
  // Statistics
  stats: {
    postsCount: {
      type: Number,
      default: 0,
    },
    likesReceived: {
      type: Number,
      default: 0,
    },
    commentsReceived: {
      type: Number,
      default: 0,
    },
    followersCount: {
      type: Number,
      default: 0,
    },
    followingCount: {
      type: Number,
      default: 0,
    },
  },
  
  // Soft Delete
  deletedAt: {
    type: Date,
    default: null,
  },
  
}, {
  timestamps: true, // createdAt, updatedAt
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Remove sensitive fields from JSON output
      delete ret.password;
      delete ret.loginAttempts;
      delete ret.lockUntil;
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

/**
 * 📊 Virtual Properties
 */

// Check if account is currently locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Get follower count
userSchema.virtual('followerCount').get(function() {
  return this.followers.length;
});

// Get following count
userSchema.virtual('followingCount').get(function() {
  return this.following.length;
});

// Get display name (penName for writers, fullName for others)
userSchema.virtual('displayName').get(function() {
  if (this.role === 'writer' && this.penName) {
    return this.penName;
  }
  return this.fullName;
});

// Check if user is banned and ban is still active
userSchema.virtual('isCurrentlyBanned').get(function() {
  if (!this.isBanned) return false;
  if (!this.banExpiresAt) return true; // Permanent ban
  return this.banExpiresAt > new Date();
});

/**
 * 🔗 Indexes for Performance
 */
userSchema.index({ role: 1 });
userSchema.index({ penName: 1 }, { sparse: true });
userSchema.index({ 'followers.user': 1 });
userSchema.index({ 'following.user': 1 });
userSchema.index({ isActive: 1, deletedAt: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastActive: -1 });

// Text index for search functionality
userSchema.index({
  fullName: 'text',
  penName: 'text',
  bio: 'text'
}, {
  weights: {
    fullName: 10,
    penName: 10,
    bio: 1
  }
});

/**
 * 🔒 Pre-save Middleware
 */
userSchema.pre('save', async function(next) {
  try {
    // Hash password if modified
    if (this.isModified('password')) {
      this.password = await bcrypt.hash(this.password, CONFIG.BCRYPT_ROUNDS);
      appLogger.info('Password changed', { userId: this._id });
    }
    
    // Update lastActive timestamp
    if (this.isModified() && !this.isNew) {
      this.lastActive = new Date();
    }
    
    // Validate role-specific fields
    if (this.role === 'reader') {
      this.penName = undefined; // Remove penName for readers
    }
    
    if (this.role === 'writer' && this.moodPreferences.length > 0) {
      this.moodPreferences = []; // Remove mood preferences for writers
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * 🔐 Instance Methods
 */

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.generateAccessToken = function() {
  return jwt.sign(
    { 
      id: this._id,
      email: this.email,
      role: this.role,
      displayName: this.displayName,
    },
    CONFIG.JWT_SECRET,
    {
      expiresIn: CONFIG.JWT_EXPIRES_IN,
    }
  );
};

// Generate refresh token
userSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    { 
      id: this._id,
      tokenType: 'refresh',
    },
    CONFIG.JWT_REFRESH_SECRET,
    {
      expiresIn: CONFIG.JWT_REFRESH_EXPIRES_IN,
    }
  );
};

// Handle failed login attempt
userSchema.methods.incLoginAttempts = async function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // If we have hit max attempts and it's not locked yet, lock the account
  if (this.loginAttempts + 1 >= CONFIG.security.maxLoginAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + CONFIG.security.lockoutDuration };
    
    appLogger.error('Account locked due to failed login attempts', {
      userId: this._id,
      email: this.email,
      attempts: this.loginAttempts + 1,
    });
  }
  
  return this.updateOne(updates);
};

// Reset login attempts on successful login
userSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() }
  });
};

// Follow another user
userSchema.methods.followUser = async function(targetUserId) {
  if (this._id.equals(targetUserId)) {
    throw new Error('Cannot follow yourself');
  }
  
  // Check if already following
  const isAlreadyFollowing = this.following.some(f => f.user.equals(targetUserId));
  if (isAlreadyFollowing) {
    throw new Error('Already following this user');
  }
  
  // Add to following list
  this.following.push({ user: targetUserId });
  await this.save();
  
  // Add to target user's followers list
  await User.findByIdAndUpdate(targetUserId, {
    $push: { followers: { user: this._id } },
    $inc: { 'stats.followersCount': 1 }
  });
  
  // Update own following count
  this.stats.followingCount = this.following.length;
  await this.save();
  
  appLogger.info('User followed', {
    followerId: this._id,
    targetId: targetUserId,
  });
};

// Unfollow a user
userSchema.methods.unfollowUser = async function(targetUserId) {
  // Remove from following list
  this.following = this.following.filter(f => !f.user.equals(targetUserId));
  await this.save();
  
  // Remove from target user's followers list
  await User.findByIdAndUpdate(targetUserId, {
    $pull: { followers: { user: this._id } },
    $inc: { 'stats.followersCount': -1 }
  });
  
  // Update own following count
  this.stats.followingCount = this.following.length;
  await this.save();
  
  appLogger.info('User unfollowed', {
    followerId: this._id,
    targetId: targetUserId,
  });
};

// Add warning to user
userSchema.methods.addWarning = async function(reason, adminId) {
  this.warnings.push({
    reason,
    issuedBy: adminId,
  });
  
  await this.save();
  
  appLogger.warn('User warned', {
    userId: this._id,
    reason,
    adminId,
    warningCount: this.warnings.length,
  });
};

// Ban user
userSchema.methods.banUser = async function(reason, adminId, expiresAt = null) {
  this.isBanned = true;
  this.banReason = reason;
  this.banExpiresAt = expiresAt;
  
  await this.save();
  
  appLogger.error('User banned', {
    userId: this._id,
    reason,
    adminId,
    expiresAt,
  });
};

// Unban user
userSchema.methods.unbanUser = async function(adminId) {
  this.isBanned = false;
  this.banReason = undefined;
  this.banExpiresAt = undefined;
  
  await this.save();
  
  appLogger.info('User unbanned', {
    userId: this._id,
    adminId,
  });
};

/**
 * 🔍 Static Methods
 */

// Find by email (including password for authentication)
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() }).select('+password');
};

// Find active users only
userSchema.statics.findActive = function(filter = {}) {
  return this.find({ 
    ...filter, 
    isActive: true, 
    deletedAt: null,
    $or: [
      { isBanned: false },
      { banExpiresAt: { $lt: new Date() } }
    ]
  });
};

// Search users with text search
userSchema.statics.searchUsers = function(query, options = {}) {
  const {
    role,
    genres,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = -1
  } = options;
  
  const filter = {
    $text: { $search: query },
    isActive: true,
    deletedAt: null,
    'privacySettings.profileVisibility': 'public'
  };
  
  if (role) filter.role = role;
  if (genres && genres.length > 0) filter.genres = { $in: genres };
  
  const sort = { [sortBy]: sortOrder };
  const skip = (page - 1) * limit;
  
  return this.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .select('-password -loginAttempts -lockUntil');
};

// Get user statistics
userSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        active: { $sum: { $cond: ['$isActive', 1, 0] } },
        verified: { $sum: { $cond: ['$isVerified', 1, 0] } },
        banned: { $sum: { $cond: ['$isBanned', 1, 0] } }
      }
    }
  ]);
  
  return stats;
};

/**
 * 🏭 Pre/Post Hooks
 */

// Pre-remove hook for soft delete
userSchema.pre('remove', function(next) {
  this.deletedAt = new Date();
  this.isActive = false;
  next();
});

// Create the User model
const User = mongoose.model('User', userSchema);

module.exports = User;