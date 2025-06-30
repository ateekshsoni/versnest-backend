/**
 * Post Routes
 * 
 * This file defines all post-related API endpoints with proper middleware stack.
 * It follows RESTful conventions and implements comprehensive security measures.
 * 
 * Routes Structure:
 * - GET /api/posts - Get posts with filtering/pagination/search
 * - POST /api/posts - Create new post
 * - GET /api/posts/trending - Get trending posts
 * - GET /api/posts/bookmarks - Get user's bookmarks
 * - GET /api/posts/author/:authorId - Get posts by specific author
 * - GET /api/posts/:postId - Get specific post by ID
 * - PUT /api/posts/:postId - Update post
 * - DELETE /api/posts/:postId - Delete post
 * - POST /api/posts/:postId/like - Like/unlike post
 * - POST /api/posts/:postId/bookmark - Bookmark/unbookmark post
 * - GET /api/posts/:postId/analytics - Get post analytics
 * 
 * Security Features:
 * - Authentication required for write operations
 * - Rate limiting per operation type
 * - Input validation via Zod schemas
 * - Authorization checks for sensitive operations
 * 
 * Learning Notes:
 * - Routes define the API contract and middleware stack
 * - Different rate limits for different operation types
 * - Public read endpoints vs protected write endpoints
 * - Proper error handling and logging
 */

const express = require('express');
const postController = require('../controllers/post.controller');
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

// Standard rate limiter for general post operations
const postRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    message: 'Too many post requests, please try again later',
    retryAfter: '15 minutes'
  }
});

// Stricter rate limiter for post creation
const createPostRateLimit = createStrictRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 posts per hour
  message: {
    success: false,
    message: 'Too many post creation requests, please try again later',
    retryAfter: '1 hour'
  }
});

// Rate limiter for interactions (likes, bookmarks)
const interactionRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 interactions per 5 minutes
  message: {
    success: false,
    message: 'Too many interaction requests, please try again later',
    retryAfter: '5 minutes'
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
const logPostRequest = (req, res, next) => {
  logger.info('Post API request', {
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
};

// ============================================================================
// PUBLIC ROUTES (No authentication required)
// ============================================================================

/**
 * @route   GET /api/posts
 * @desc    Get posts with filtering, pagination, and search
 * @access  Public (but rate limited)
 * @rateLimit Standard post rate limit
 */
router.get('/', 
  postRateLimit,
  optionalAuth, // Optional auth for personalized results
  logPostRequest,
  postController.getPosts
);

/**
 * @route   GET /api/posts/trending
 * @desc    Get trending posts based on engagement
 * @access  Public (but rate limited)
 * @rateLimit Search rate limit
 */
router.get('/trending', 
  searchRateLimit,
  optionalAuth,
  logPostRequest,
  postController.getTrendingPosts
);

/**
 * @route   GET /api/posts/author/:authorId
 * @desc    Get posts by specific author
 * @access  Public (but rate limited)
 * @rateLimit Standard post rate limit
 */
router.get('/author/:authorId', 
  postRateLimit,
  optionalAuth,
  logPostRequest,
  postController.getPostsByAuthor
);

/**
 * @route   GET /api/posts/:postId
 * @desc    Get specific post by ID with view tracking
 * @access  Public (but rate limited)
 * @rateLimit Standard post rate limit
 */
router.get('/:postId', 
  postRateLimit,
  optionalAuth, // Optional auth for user interactions
  logPostRequest,
  postController.getPostById
);

// ============================================================================
// PROTECTED ROUTES (Authentication required)
// ============================================================================

/**
 * @route   POST /api/posts
 * @desc    Create new post
 * @access  Private
 * @rateLimit Strict post creation rate limit
 */
router.post('/', 
  createPostRateLimit,
  authenticate,
  logPostRequest,
  postController.createPost
);

/**
 * @route   GET /api/posts/bookmarks
 * @desc    Get current user's bookmarked posts
 * @access  Private
 * @rateLimit Standard post rate limit
 * @note    This must come before /:postId to avoid route conflicts
 */
router.get('/bookmarks', 
  postRateLimit,
  authenticate,
  logPostRequest,
  postController.getUserBookmarks
);

/**
 * @route   PUT /api/posts/:postId
 * @desc    Update post (author only)
 * @access  Private
 * @rateLimit Standard post rate limit
 */
router.put('/:postId', 
  postRateLimit,
  authenticate,
  logPostRequest,
  postController.updatePost
);

/**
 * @route   DELETE /api/posts/:postId
 * @desc    Delete post (author only)
 * @access  Private
 * @rateLimit Strict rate limit (deletion is serious)
 */
router.delete('/:postId', 
  createStrictRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Only 5 deletions per hour
    message: {
      success: false,
      message: 'Too many deletion requests, please try again later',
      retryAfter: '1 hour'
    }
  }),
  authenticate,
  logPostRequest,
  postController.deletePost
);

/**
 * @route   POST /api/posts/:postId/like
 * @desc    Like or unlike a post
 * @access  Private
 * @rateLimit Interaction rate limit
 */
router.post('/:postId/like', 
  interactionRateLimit,
  authenticate,
  logPostRequest,
  postController.toggleLike
);

/**
 * @route   POST /api/posts/:postId/bookmark
 * @desc    Bookmark or unbookmark a post
 * @access  Private
 * @rateLimit Interaction rate limit
 */
router.post('/:postId/bookmark', 
  interactionRateLimit,
  authenticate,
  logPostRequest,
  postController.toggleBookmark
);

/**
 * @route   GET /api/posts/:postId/analytics
 * @desc    Get post analytics (author or admin only)
 * @access  Private
 * @rateLimit Standard post rate limit
 */
router.get('/:postId/analytics', 
  postRateLimit,
  authenticate,
  logPostRequest,
  postController.getPostAnalytics
);

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

// Route-specific error handler
router.use((error, req, res, next) => {
  logger.error('Post route error', {
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

// 404 handler for undefined post routes
router.use('*', (req, res) => {
  logger.warn('Post route not found', {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    message: 'Post endpoint not found',
    error: {
      code: 'ROUTE_NOT_FOUND',
      path: req.originalUrl,
      method: req.method
    }
  });
});

module.exports = router;
