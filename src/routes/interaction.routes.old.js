/**
 * Interaction Routes
 * 
 * This module defines all routes for user interactions like likes, bookmarks, shares, etc.
 * These routes handle social features that create engagement between users and content.
 * 
 * Features:
 * - Like/unlike posts and comments
 * - Bookmark/unbookmark content
 * - Share posts and generate share analytics
 * - Get user's interaction history
 * - Bulk interaction operations
 * - Interaction analytics and insights
 * 
 * Security:
 * - All routes require authentication
 * - Rate limiting prevents spam interactions
 * - Input validation with Zod schemas
 * - Logging for monitoring and analytics
 * 
 * Learning Notes:
 * - Routes are focused and handle single responsibilities
 * - Middleware is applied strategically for security and monitoring
 * - Response format is consistent across all endpoints
 * - Error handling is centralized and informative
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validation');
const interactionController = require('../controllers/interaction.controller');
const { interactionSchemas } = require('../validators/schemas');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Rate limiting for interaction endpoints
 * More permissive than auth routes but still prevents abuse
 */
const interactionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many interaction requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiting for bulk operations
 */
const bulkOperationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 bulk operations per hour
  message: {
    error: 'Too many bulk operations from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Middleware to log interaction attempts for analytics
 */
const logInteraction = (req, res, next) => {
  logger.info('Interaction attempt', {
    userId: req.user?.id,
    action: req.route?.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
};

// Apply middleware to all routes
router.use(interactionRateLimit);
router.use(authenticate);
router.use(logInteraction);

/**
 * POST /api/interactions/posts/:postId/like
 * Like or unlike a post
 * 
 * Toggles the like status for a post. If already liked, removes the like.
 * If not liked, adds a like. Returns the updated like status and count.
 */
router.post(
  '/posts/:postId/like',
  validate(interactionSchemas.toggleLike),
  interactionController.togglePostLike
);

/**
 * POST /api/interactions/posts/:postId/bookmark
 * Bookmark or unbookmark a post
 * 
 * Toggles the bookmark status for a post. Bookmarks are private
 * and allow users to save content for later reading.
 */
router.post(
  '/posts/:postId/bookmark',
  validate(interactionSchemas.toggleBookmark),
  interactionController.togglePostBookmark
);

/**
 * POST /api/interactions/posts/:postId/share
 * Share a post and track sharing analytics
 * 
 * Records a share event for analytics and optionally sends
 * notifications to the post author about engagement.
 */
router.post(
  '/posts/:postId/share',
  validate(interactionSchemas.sharePost),
  interactionController.sharePost
);

/**
 * POST /api/interactions/comments/:commentId/like
 * Like or unlike a comment
 * 
 * Similar to post likes but for comments. Helps surface
 * high-quality discussions and user engagement.
 */
router.post(
  '/comments/:commentId/like',
  validate(interactionSchemas.toggleLike),
  interactionController.toggleCommentLike
);

/**
 * GET /api/interactions/posts/:postId/likes
 * Get users who liked a post
 * 
 * Returns paginated list of users who liked the post.
 * Useful for showing engagement and social proof.
 */
router.get(
  '/posts/:postId/likes',
  validate(interactionSchemas.getPaginatedLikes),
  interactionController.getPostLikes
);

/**
 * GET /api/interactions/comments/:commentId/likes
 * Get users who liked a comment
 * 
 * Returns paginated list of users who liked the comment.
 */
router.get(
  '/comments/:commentId/likes',
  validate(interactionSchemas.getPaginatedLikes),
  interactionController.getCommentLikes
);

/**
 * GET /api/interactions/my-bookmarks
 * Get current user's bookmarked posts
 * 
 * Returns paginated list of posts bookmarked by the authenticated user.
 * Supports filtering and sorting options.
 */
router.get(
  '/my-bookmarks',
  validate(interactionSchemas.getBookmarks),
  interactionController.getUserBookmarks
);

/**
 * GET /api/interactions/my-likes
 * Get current user's liked posts and comments
 * 
 * Returns paginated list of content liked by the authenticated user.
 * Useful for user's activity history and preferences.
 */
router.get(
  '/my-likes',
  validate(interactionSchemas.getLikeHistory),
  interactionController.getUserLikes
);

/**
 * POST /api/interactions/bulk-like
 * Bulk like multiple posts or comments
 * 
 * Allows users to like multiple items at once.
 * Rate limited to prevent abuse and spam.
 */
router.post(
  '/bulk-like',
  bulkOperationRateLimit,
  validate(interactionSchemas.bulkLike),
  interactionController.bulkLike
);

/**
 * POST /api/interactions/bulk-bookmark
 * Bulk bookmark multiple posts
 * 
 * Allows users to bookmark multiple posts at once.
 * Useful for saving collections of related content.
 */
router.post(
  '/bulk-bookmark',
  bulkOperationRateLimit,
  validate(interactionSchemas.bulkBookmark),
  interactionController.bulkBookmark
);

/**
 * DELETE /api/interactions/bulk-unlike
 * Bulk unlike multiple posts or comments
 * 
 * Allows users to remove likes from multiple items at once.
 * Helps with cleanup and preference management.
 */
router.delete(
  '/bulk-unlike',
  bulkOperationRateLimit,
  validate(interactionSchemas.bulkUnlike),
  interactionController.bulkUnlike
);

/**
 * DELETE /api/interactions/bulk-unbookmark
 * Bulk unbookmark multiple posts
 * 
 * Allows users to remove bookmarks from multiple posts at once.
 * Useful for cleaning up saved content collections.
 */
router.delete(
  '/bulk-unbookmark',
  bulkOperationRateLimit,
  validate(interactionSchemas.bulkUnbookmark),
  interactionController.bulkUnbookmark
);

/**
 * GET /api/interactions/analytics
 * Get interaction analytics for user's content
 * 
 * Returns analytics about how others interact with the user's posts.
 * Includes likes, shares, bookmarks, and engagement trends.
 */
router.get(
  '/analytics',
  validate(interactionSchemas.getAnalytics),
  interactionController.getInteractionAnalytics
);

/**
 * GET /api/interactions/trending
 * Get trending interactions and popular content
 * 
 * Returns posts and comments with high engagement rates.
 * Useful for discovering popular content and trends.
 */
router.get(
  '/trending',
  validate(interactionSchemas.getTrending),
  interactionController.getTrendingContent
);

module.exports = router;
