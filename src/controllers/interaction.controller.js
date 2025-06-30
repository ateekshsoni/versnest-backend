/**
 * Interaction Controller
 * 
 * This controller handles all HTTP requests related to user interactions
 * such as likes, bookmarks, shares, and social engagement features.
 * It acts as the bridge between the HTTP layer and the interaction service.
 * 
 * Features:
 * - Like/unlike posts and comments
 * - Bookmark management
 * - Share tracking and analytics
 * - Bulk operations for efficiency
 * - Interaction analytics and insights
 * - Trending content discovery
 * 
 * Learning Notes:
 * - Controllers focus on HTTP concerns (request/response handling)
 * - Business logic is delegated to services
 * - Consistent error handling and response formatting
 * - Comprehensive logging for monitoring
 * - Input validation happens at middleware level
 */

const interactionService = require('../services/interaction.service');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');

class InteractionController {
  /**
   * Toggle like status for a post
   * POST /api/interactions/posts/:postId/like
   */
  async togglePostLike(req, res, next) {
    try {
      const { postId } = req.params;
      const userId = req.user.id;

      logger.info('Toggling post like', { postId, userId });

      const result = await interactionService.togglePostLike(postId, userId);

      return successResponse(res, result, 'Post like status updated successfully');
    } catch (error) {
      logger.error('Error toggling post like', { 
        error: error.message, 
        postId: req.params.postId,
        userId: req.user.id 
      });
      next(error);
    }
  }

  /**
   * Toggle bookmark status for a post
   * POST /api/interactions/posts/:postId/bookmark
   */
  async togglePostBookmark(req, res, next) {
    try {
      const { postId } = req.params;
      const userId = req.user.id;

      logger.info('Toggling post bookmark', { postId, userId });

      const result = await interactionService.togglePostBookmark(postId, userId);

      return successResponse(res, result, 'Post bookmark status updated successfully');
    } catch (error) {
      logger.error('Error toggling post bookmark', { 
        error: error.message, 
        postId: req.params.postId,
        userId: req.user.id 
      });
      next(error);
    }
  }

  /**
   * Share a post and track analytics
   * POST /api/interactions/posts/:postId/share
   */
  async sharePost(req, res, next) {
    try {
      const { postId } = req.params;
      const { platform, customMessage } = req.body;
      const userId = req.user.id;

      logger.info('Sharing post', { postId, userId, platform });

      const result = await interactionService.sharePost(postId, userId, {
        platform,
        customMessage
      });

      return successResponse(res, result, 'Post shared successfully');
    } catch (error) {
      logger.error('Error sharing post', { 
        error: error.message, 
        postId: req.params.postId,
        userId: req.user.id 
      });
      next(error);
    }
  }

  /**
   * Toggle like status for a comment
   * POST /api/interactions/comments/:commentId/like
   */
  async toggleCommentLike(req, res, next) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;

      logger.info('Toggling comment like', { commentId, userId });

      const result = await interactionService.toggleCommentLike(commentId, userId);

      return successResponse(res, result, 'Comment like status updated successfully');
    } catch (error) {
      logger.error('Error toggling comment like', { 
        error: error.message, 
        commentId: req.params.commentId,
        userId: req.user.id 
      });
      next(error);
    }
  }

  /**
   * Get users who liked a post
   * GET /api/interactions/posts/:postId/likes
   */
  async getPostLikes(req, res, next) {
    try {
      const { postId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      logger.info('Getting post likes', { postId, page, limit });

      const result = await interactionService.getPostLikes(postId, {
        page: parseInt(page),
        limit: parseInt(limit)
      });

      return successResponse(res, result, 'Post likes retrieved successfully');
    } catch (error) {
      logger.error('Error getting post likes', { 
        error: error.message, 
        postId: req.params.postId 
      });
      next(error);
    }
  }

  /**
   * Get users who liked a comment
   * GET /api/interactions/comments/:commentId/likes
   */
  async getCommentLikes(req, res, next) {
    try {
      const { commentId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      logger.info('Getting comment likes', { commentId, page, limit });

      const result = await interactionService.getCommentLikes(commentId, {
        page: parseInt(page),
        limit: parseInt(limit)
      });

      return successResponse(res, result, 'Comment likes retrieved successfully');
    } catch (error) {
      logger.error('Error getting comment likes', { 
        error: error.message, 
        commentId: req.params.commentId 
      });
      next(error);
    }
  }

  /**
   * Get current user's bookmarked posts
   * GET /api/interactions/my-bookmarks
   */
  async getUserBookmarks(req, res, next) {
    try {
      const userId = req.user.id;
      const { 
        page = 1, 
        limit = 10, 
        sortBy = 'createdAt', 
        sortOrder = 'desc',
        category,
        tags 
      } = req.query;

      logger.info('Getting user bookmarks', { userId, page, limit });

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder,
        category,
        tags: tags ? tags.split(',') : undefined
      };

      const result = await interactionService.getUserBookmarks(userId, options);

      return successResponse(res, result, 'User bookmarks retrieved successfully');
    } catch (error) {
      logger.error('Error getting user bookmarks', { 
        error: error.message, 
        userId: req.user.id 
      });
      next(error);
    }
  }

  /**
   * Get current user's liked content
   * GET /api/interactions/my-likes
   */
  async getUserLikes(req, res, next) {
    try {
      const userId = req.user.id;
      const { 
        page = 1, 
        limit = 10, 
        type = 'all', // 'posts', 'comments', 'all'
        sortBy = 'createdAt', 
        sortOrder = 'desc' 
      } = req.query;

      logger.info('Getting user likes', { userId, page, limit, type });

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        type,
        sortBy,
        sortOrder
      };

      const result = await interactionService.getUserLikes(userId, options);

      return successResponse(res, result, 'User likes retrieved successfully');
    } catch (error) {
      logger.error('Error getting user likes', { 
        error: error.message, 
        userId: req.user.id 
      });
      next(error);
    }
  }

  /**
   * Bulk like multiple items
   * POST /api/interactions/bulk-like
   */
  async bulkLike(req, res, next) {
    try {
      const userId = req.user.id;
      const { postIds = [], commentIds = [] } = req.body;

      logger.info('Bulk like operation', { 
        userId, 
        postCount: postIds.length, 
        commentCount: commentIds.length 
      });

      const result = await interactionService.bulkLike(userId, {
        postIds,
        commentIds
      });

      return successResponse(res, result, 'Bulk like operation completed successfully');
    } catch (error) {
      logger.error('Error in bulk like operation', { 
        error: error.message, 
        userId: req.user.id 
      });
      next(error);
    }
  }

  /**
   * Bulk bookmark multiple posts
   * POST /api/interactions/bulk-bookmark
   */
  async bulkBookmark(req, res, next) {
    try {
      const userId = req.user.id;
      const { postIds } = req.body;

      logger.info('Bulk bookmark operation', { userId, postCount: postIds.length });

      const result = await interactionService.bulkBookmark(userId, postIds);

      return successResponse(res, result, 'Bulk bookmark operation completed successfully');
    } catch (error) {
      logger.error('Error in bulk bookmark operation', { 
        error: error.message, 
        userId: req.user.id 
      });
      next(error);
    }
  }

  /**
   * Bulk unlike multiple items
   * DELETE /api/interactions/bulk-unlike
   */
  async bulkUnlike(req, res, next) {
    try {
      const userId = req.user.id;
      const { postIds = [], commentIds = [] } = req.body;

      logger.info('Bulk unlike operation', { 
        userId, 
        postCount: postIds.length, 
        commentCount: commentIds.length 
      });

      const result = await interactionService.bulkUnlike(userId, {
        postIds,
        commentIds
      });

      return successResponse(res, result, 'Bulk unlike operation completed successfully');
    } catch (error) {
      logger.error('Error in bulk unlike operation', { 
        error: error.message, 
        userId: req.user.id 
      });
      next(error);
    }
  }

  /**
   * Bulk unbookmark multiple posts
   * DELETE /api/interactions/bulk-unbookmark
   */
  async bulkUnbookmark(req, res, next) {
    try {
      const userId = req.user.id;
      const { postIds } = req.body;

      logger.info('Bulk unbookmark operation', { userId, postCount: postIds.length });

      const result = await interactionService.bulkUnbookmark(userId, postIds);

      return successResponse(res, result, 'Bulk unbookmark operation completed successfully');
    } catch (error) {
      logger.error('Error in bulk unbookmark operation', { 
        error: error.message, 
        userId: req.user.id 
      });
      next(error);
    }
  }

  /**
   * Get interaction analytics for user's content
   * GET /api/interactions/analytics
   */
  async getInteractionAnalytics(req, res, next) {
    try {
      const userId = req.user.id;
      const { 
        startDate, 
        endDate, 
        groupBy = 'day', // 'day', 'week', 'month'
        contentType = 'all' // 'posts', 'comments', 'all'
      } = req.query;

      logger.info('Getting interaction analytics', { userId, startDate, endDate, groupBy });

      const options = {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        groupBy,
        contentType
      };

      const result = await interactionService.getInteractionAnalytics(userId, options);

      return successResponse(res, result, 'Interaction analytics retrieved successfully');
    } catch (error) {
      logger.error('Error getting interaction analytics', { 
        error: error.message, 
        userId: req.user.id 
      });
      next(error);
    }
  }

  /**
   * Get trending content based on interactions
   * GET /api/interactions/trending
   */
  async getTrendingContent(req, res, next) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        timeframe = '24h', // '1h', '24h', '7d', '30d'
        contentType = 'posts', // 'posts', 'comments'
        category 
      } = req.query;

      logger.info('Getting trending content', { page, limit, timeframe, contentType });

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        timeframe,
        contentType,
        category
      };

      const result = await interactionService.getTrendingContent(options);

      return successResponse(res, result, 'Trending content retrieved successfully');
    } catch (error) {
      logger.error('Error getting trending content', { 
        error: error.message 
      });
      next(error);
    }
  }
}

module.exports = new InteractionController();
