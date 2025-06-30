/**
 * Comment Routes
 * 
 * This file defines all comment-related API endpoints with proper middleware stack.
 * It handles comment operations including creation, retrieval, updates, deletion,
 * and social interactions with comprehensive security measures.
 * 
 * Routes Structure:
 * - POST /api/comments - Create new comment
 * - GET /api/comments/post/:postId - Get comments for a post
 * - GET /api/comments/user/:userId - Get user's comments
 * - GET /api/comments/:commentId - Get specific comment
 * - GET /api/comments/:commentId/replies - Get comment replies
 * - PUT /api/comments/:commentId - Update comment
 * - DELETE /api/comments/:commentId - Delete comment
 * - POST /api/comments/:commentId/like - Like/unlike comment
 * - POST /api/comments/:commentId/report - Report comment
 * 
 * Security Features:
 * - Authentication required for write operations
 * - Rate limiting per operation type
 * - Input validation via Zod schemas
 * - Permission checks for sensitive operations
 * 
 * Learning Notes:
 * - Routes define API contract and middleware order
 * - Different rate limits for different operations
 * - Public read vs protected write endpoints
 * - Proper error handling and logging
 */

const express = require('express');
const commentController = require('../controllers/comment.controller');
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

// Standard rate limiter for general comment operations
const commentRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    message: 'Too many comment requests, please try again later',
    retryAfter: '15 minutes'
  }
});

// Stricter rate limiter for comment creation
const createCommentRateLimit = createStrictRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 comments per 10 minutes
  message: {
    success: false,
    message: 'Too many comment creation requests, please try again later',
    retryAfter: '10 minutes'
  }
});

// Rate limiter for interactions (likes, reports)
const interactionRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 interactions per 5 minutes
  message: {
    success: false,
    message: 'Too many interaction requests, please try again later',
    retryAfter: '5 minutes'
  }
});

// Rate limiter for reporting (more restrictive)
const reportRateLimit = createStrictRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 reports per hour
  message: {
    success: false,
    message: 'Too many report requests, please try again later',
    retryAfter: '1 hour'
  }
});

// ============================================================================
// LOGGING MIDDLEWARE
// ============================================================================

// Request logging middleware
const logCommentRequest = (req, res, next) => {
  logger.info('Comment API request', {
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
 * @route   GET /api/comments/post/:postId
 * @desc    Get comments for a specific post
 * @access  Public (but rate limited)
 * @rateLimit Standard comment rate limit
 */
router.get('/post/:postId', 
  commentRateLimit,
  optionalAuth, // Optional auth for user interactions
  logCommentRequest,
  commentController.getPostComments
);

/**
 * @route   GET /api/comments/user/:userId
 * @desc    Get comments by a specific user
 * @access  Public (but rate limited)
 * @rateLimit Standard comment rate limit
 */
router.get('/user/:userId', 
  commentRateLimit,
  optionalAuth,
  logCommentRequest,
  commentController.getUserComments
);

/**
 * @route   GET /api/comments/:commentId
 * @desc    Get specific comment by ID
 * @access  Public (but rate limited)
 * @rateLimit Standard comment rate limit
 */
router.get('/:commentId', 
  commentRateLimit,
  optionalAuth,
  logCommentRequest,
  commentController.getCommentById
);

/**
 * @route   GET /api/comments/:commentId/replies
 * @desc    Get replies to a specific comment
 * @access  Public (but rate limited)
 * @rateLimit Standard comment rate limit
 */
router.get('/:commentId/replies', 
  commentRateLimit,
  optionalAuth,
  logCommentRequest,
  commentController.getCommentReplies
);

// ============================================================================
// PROTECTED ROUTES (Authentication required)
// ============================================================================

/**
 * @route   POST /api/comments
 * @desc    Create new comment
 * @access  Private
 * @rateLimit Strict comment creation rate limit
 */
router.post('/', 
  createCommentRateLimit,
  authenticate,
  logCommentRequest,
  commentController.createComment
);

/**
 * @route   PUT /api/comments/:commentId
 * @desc    Update comment (author only)
 * @access  Private
 * @rateLimit Standard comment rate limit
 */
router.put('/:commentId', 
  commentRateLimit,
  authenticate,
  logCommentRequest,
  commentController.updateComment
);

/**
 * @route   DELETE /api/comments/:commentId
 * @desc    Delete comment (author only)
 * @access  Private
 * @rateLimit Strict rate limit (deletion is serious)
 */
router.delete('/:commentId', 
  createStrictRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Only 10 deletions per hour
    message: {
      success: false,
      message: 'Too many deletion requests, please try again later',
      retryAfter: '1 hour'
    }
  }),
  authenticate,
  logCommentRequest,
  commentController.deleteComment
);

/**
 * @route   POST /api/comments/:commentId/like
 * @desc    Like or unlike a comment
 * @access  Private
 * @rateLimit Interaction rate limit
 */
router.post('/:commentId/like', 
  interactionRateLimit,
  authenticate,
  logCommentRequest,
  commentController.toggleLike
);

/**
 * @route   POST /api/comments/:commentId/report
 * @desc    Report a comment for moderation
 * @access  Private
 * @rateLimit Report rate limit (more restrictive)
 */
router.post('/:commentId/report', 
  reportRateLimit,
  authenticate,
  logCommentRequest,
  commentController.reportComment
);

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

// Route-specific error handler
router.use((error, req, res, next) => {
  logger.error('Comment route error', {
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

// 404 handler for undefined comment routes
router.use('*', (req, res) => {
  logger.warn('Comment route not found', {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    message: 'Comment endpoint not found',
    error: {
      code: 'ROUTE_NOT_FOUND',
      path: req.originalUrl,
      method: req.method
    }
  });
});

module.exports = router;
