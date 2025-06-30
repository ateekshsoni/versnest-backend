/**
 * User Routes
 * 
 * This file defines all user-related API endpoints and their middleware stack.
 * It follows RESTful conventions and implements proper security measures.
 * 
 * Routes Structure:
 * - GET /api/users/me - Get current user profile
 * - PUT /api/users/me - Update current user profile  
 * - DELETE /api/users/me - Delete current user account
 * - GET /api/users/search - Search users
 * - GET /api/users/:userId - Get user profile by ID
 * - GET /api/users/:userId/followers - Get user followers
 * - GET /api/users/:userId/following - Get user following
 * - POST /api/users/:userId/follow - Follow user
 * - DELETE /api/users/:userId/follow - Unfollow user
 * - GET /api/users/:userId/activity - Get user activity
 * 
 * Security Features:
 * - Authentication required for most endpoints
 * - Rate limiting per endpoint type
 * - Input validation via middleware
 * - Role-based access control where needed
 * 
 * Learning Notes:
 * - Routes define the API contract
 * - Middleware order matters (auth before validation)
 * - Different rate limits for different operations
 * - Public vs protected endpoints
 */

const express = require('express');
const userController = require('../controllers/user.controller');
const { authenticate, optionalAuth } = require('../middlewares/auth');
const { 
  createRateLimiter, 
  createStrictRateLimiter 
} = require('../middlewares/security');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================================
// RATE LIMITING CONFIGURATION
// ============================================================================

// Standard rate limiter for general user operations
const userRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    message: 'Too many user requests, please try again later',
    retryAfter: '15 minutes'
  }
});

// Stricter rate limiter for follow/unfollow operations
const followRateLimit = createStrictRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 follow/unfollow actions per hour
  message: {
    success: false,
    message: 'Too many follow/unfollow requests, please try again later',
    retryAfter: '1 hour'
  }
});

// Search rate limiter
const searchRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 searches per 5 minutes
  message: {
    success: false,
    message: 'Too many search requests, please try again later',
    retryAfter: '5 minutes'
  }
});

// ============================================================================
// LOGGING MIDDLEWARE
// ============================================================================

// Request logging middleware
const logUserRequest = (req, res, next) => {
  logger.info('User API request', {
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
};

// ============================================================================
// CURRENT USER ROUTES (Authentication Required)
// ============================================================================

/**
 * @route   GET /api/users/me
 * @desc    Get current user's profile
 * @access  Private
 * @rateLimit Standard user rate limit
 */
router.get('/me', 
  userRateLimit,
  authenticate,
  logUserRequest,
  userController.getCurrentUserProfile
);

/**
 * @route   PUT /api/users/me
 * @desc    Update current user's profile
 * @access  Private
 * @rateLimit Standard user rate limit
 */
router.put('/me', 
  userRateLimit,
  authenticate,
  logUserRequest,
  userController.updateUserProfile
);

/**
 * @route   DELETE /api/users/me
 * @desc    Delete current user's account (soft delete)
 * @access  Private
 * @rateLimit Strict rate limit (account deletion is serious)
 */
router.delete('/me', 
  createStrictRateLimiter({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 3, // Only 3 deletion attempts per day
    message: {
      success: false,
      message: 'Too many account deletion attempts, please contact support',
      retryAfter: '24 hours'
    }
  }),
  authenticate,
  logUserRequest,
  userController.deleteCurrentUser
);

// ============================================================================
// USER SEARCH ROUTES
// ============================================================================

/**
 * @route   GET /api/users/search
 * @desc    Search users with pagination and filtering
 * @access  Public (but rate limited)
 * @rateLimit Search-specific rate limit
 */
router.get('/search', 
  searchRateLimit,
  optionalAuth, // Optional authentication for personalized results
  logUserRequest,
  userController.searchUsers
);

// ============================================================================
// USER PROFILE ROUTES
// ============================================================================

/**
 * @route   GET /api/users/:userId
 * @desc    Get user profile by ID
 * @access  Public (but rate limited)
 * @rateLimit Standard user rate limit
 */
router.get('/:userId', 
  userRateLimit,
  optionalAuth, // Optional auth for relationship status
  logUserRequest,
  userController.getUserProfile
);

/**
 * @route   GET /api/users/:userId/activity
 * @desc    Get user's activity summary
 * @access  Public (privacy-filtered)
 * @rateLimit Standard user rate limit
 */
router.get('/:userId/activity', 
  userRateLimit,
  optionalAuth,
  logUserRequest,
  userController.getUserActivity
);

// ============================================================================
// FOLLOWER/FOLLOWING ROUTES
// ============================================================================

/**
 * @route   GET /api/users/:userId/followers
 * @desc    Get user's followers list
 * @access  Public (privacy-filtered)
 * @rateLimit Standard user rate limit
 */
router.get('/:userId/followers', 
  userRateLimit,
  optionalAuth,
  logUserRequest,
  userController.getUserFollowers
);

/**
 * @route   GET /api/users/:userId/following
 * @desc    Get user's following list
 * @access  Public (privacy-filtered)
 * @rateLimit Standard user rate limit
 */
router.get('/:userId/following', 
  userRateLimit,
  optionalAuth,
  logUserRequest,
  userController.getUserFollowing
);

// ============================================================================
// FOLLOW/UNFOLLOW ROUTES (Authentication Required)
// ============================================================================

/**
 * @route   POST /api/users/:userId/follow
 * @desc    Follow a user
 * @access  Private
 * @rateLimit Strict follow rate limit
 */
router.post('/:userId/follow', 
  followRateLimit,
  authenticate,
  logUserRequest,
  userController.followUser
);

/**
 * @route   DELETE /api/users/:userId/follow
 * @desc    Unfollow a user
 * @access  Private
 * @rateLimit Strict follow rate limit
 */
router.delete('/:userId/follow', 
  followRateLimit,
  authenticate,
  logUserRequest,
  userController.unfollowUser
);

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

// Route-specific error handler
router.use((error, req, res, next) => {
  logger.error('User route error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    ip: req.ip
  });
  
  // Pass to global error handler
  next(error);
});

// 404 handler for undefined user routes
router.use('*', (req, res) => {
  logger.warn('User route not found', {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    message: 'User endpoint not found',
    error: {
      code: 'ROUTE_NOT_FOUND',
      path: req.originalUrl,
      method: req.method
    }
  });
});

module.exports = router;
