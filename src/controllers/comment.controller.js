/**
 * Comment Controller
 * 
 * This controller handles all comment-related HTTP requests and responses.
 * It manages the HTTP layer for comment operations including creation,
 * retrieval, updates, deletion, and social interactions.
 * 
 * Endpoints:
 * - POST /api/comments - Create new comment
 * - GET /api/comments/post/:postId - Get comments for a post
 * - GET /api/comments/:commentId - Get specific comment
 * - PUT /api/comments/:commentId - Update comment
 * - DELETE /api/comments/:commentId - Delete comment
 * - POST /api/comments/:commentId/like - Like/unlike comment
 * - POST /api/comments/:commentId/report - Report comment
 * - GET /api/comments/user/:userId - Get user's comments
 * 
 * Learning Notes:
 * - Controllers handle HTTP concerns, not business logic
 * - Input validation with Zod schemas
 * - Consistent response formatting
 * - Error handling delegation to middleware
 * - Proper status codes for different operations
 */

const commentService = require('../services/comment.service');
const { 
  commentCreateSchema,
  commentUpdateSchema,
  paginationSchema 
} = require('../validators/schemas');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

class CommentController {
  /**
   * Create new comment
   * POST /api/comments
   * 
   * Creates a new comment on a post with content validation.
   * Handles both top-level comments and replies.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async createComment(req, res, next) {
    try {
      const authorId = req.user.id;
      const { postId } = req.body;
      const commentData = req.body;

      logger.info('Create comment request', { 
        authorId, 
        postId,
        hasParent: !!commentData.parentComment 
      });

      // Validate input data
      const validationResult = commentCreateSchema.safeParse(commentData);
      if (!validationResult.success) {
        throw new ValidationError(
          'Invalid comment data',
          validationResult.error.issues
        );
      }

      // Validate postId separately
      if (!postId) {
        throw new ValidationError('Post ID is required');
      }

      const newComment = await commentService.createComment(
        validationResult.data,
        authorId,
        postId
      );

      res.status(201).json({
        success: true,
        message: 'Comment created successfully',
        data: {
          comment: newComment
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get comments for a post
   * GET /api/comments/post/:postId
   * 
   * Returns paginated comments for a specific post.
   * Supports threading and sorting options.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPostComments(req, res, next) {
    try {
      const { postId } = req.params;
      const queryParams = req.query;

      logger.info('Get post comments request', { 
        postId, 
        query: queryParams 
      });

      // Validate pagination parameters
      const paginationValidation = paginationSchema.safeParse(queryParams);
      if (!paginationValidation.success) {
        throw new ValidationError(
          'Invalid pagination parameters',
          paginationValidation.error.issues
        );
      }

      // Additional query options
      const options = {
        ...paginationValidation.data,
        sortBy: queryParams.sortBy || 'createdAt',
        sortOrder: queryParams.sortOrder || 'desc',
        parentComment: queryParams.parentComment || null
      };

      const result = await commentService.getPostComments(postId, options);

      res.status(200).json({
        success: true,
        message: 'Comments retrieved successfully',
        data: {
          comments: result.comments,
          pagination: result.pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get specific comment by ID
   * GET /api/comments/:commentId
   * 
   * Returns detailed comment information including replies.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getCommentById(req, res, next) {
    try {
      const { commentId } = req.params;
      const userId = req.user?.id;

      logger.info('Get comment by ID request', { commentId, userId });

      const comment = await commentService.getCommentById(commentId, userId);

      res.status(200).json({
        success: true,
        message: 'Comment retrieved successfully',
        data: {
          comment
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update comment
   * PUT /api/comments/:commentId
   * 
   * Updates comment content. Only comment author can update.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;
      const updateData = req.body;

      logger.info('Update comment request', { 
        commentId, 
        userId,
        fields: Object.keys(updateData) 
      });

      // Validate update data
      const validationResult = commentUpdateSchema.safeParse(updateData);
      if (!validationResult.success) {
        throw new ValidationError(
          'Invalid update data',
          validationResult.error.issues
        );
      }

      const updatedComment = await commentService.updateComment(
        commentId,
        validationResult.data,
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Comment updated successfully',
        data: {
          comment: updatedComment
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete comment
   * DELETE /api/comments/:commentId
   * 
   * Deletes a comment. Only comment author can delete their comments.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;

      logger.info('Delete comment request', { commentId, userId });

      const result = await commentService.deleteComment(commentId, userId, false);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Like/unlike comment
   * POST /api/comments/:commentId/like
   * 
   * Toggles like status for a comment.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async toggleLike(req, res, next) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;

      logger.info('Toggle comment like request', { commentId, userId });

      const result = await commentService.toggleLike(commentId, userId);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          isLiked: result.isLiked
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Report comment
   * POST /api/comments/:commentId/report
   * 
   * Reports a comment for moderation review.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async reportComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;
      const { reason } = req.body;

      logger.info('Report comment request', { commentId, userId, reason });

      // Validate reason
      if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
        throw new ValidationError('Report reason must be at least 5 characters long');
      }

      if (reason.length > 500) {
        throw new ValidationError('Report reason must be at most 500 characters long');
      }

      const result = await commentService.reportComment(
        commentId, 
        userId, 
        reason.trim()
      );

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's comments
   * GET /api/comments/user/:userId
   * 
   * Returns paginated list of comments by a specific user.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getUserComments(req, res, next) {
    try {
      const { userId } = req.params;
      const queryParams = req.query;

      logger.info('Get user comments request', { userId, query: queryParams });

      // Validate pagination parameters
      const paginationValidation = paginationSchema.safeParse(queryParams);
      if (!paginationValidation.success) {
        throw new ValidationError(
          'Invalid pagination parameters',
          paginationValidation.error.issues
        );
      }

      const result = await commentService.getUserComments(
        userId,
        paginationValidation.data
      );

      res.status(200).json({
        success: true,
        message: 'User comments retrieved successfully',
        data: {
          comments: result.comments,
          pagination: result.pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get comment replies
   * GET /api/comments/:commentId/replies
   * 
   * Returns paginated replies to a specific comment.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getCommentReplies(req, res, next) {
    try {
      const { commentId } = req.params;
      const queryParams = req.query;

      logger.info('Get comment replies request', { commentId, query: queryParams });

      // Validate pagination parameters
      const paginationValidation = paginationSchema.safeParse(queryParams);
      if (!paginationValidation.success) {
        throw new ValidationError(
          'Invalid pagination parameters',
          paginationValidation.error.issues
        );
      }

      // First, get the parent comment to get the post ID
      const parentComment = await commentService.getCommentById(commentId);
      if (!parentComment) {
        throw new NotFoundError('Parent comment not found');
      }

      // Get replies using the post comments method with parentComment filter
      const options = {
        ...paginationValidation.data,
        sortBy: queryParams.sortBy || 'createdAt',
        sortOrder: queryParams.sortOrder || 'asc', // Replies usually shown chronologically
        parentComment: commentId
      };

      const result = await commentService.getPostComments(
        parentComment.post._id,
        options
      );

      res.status(200).json({
        success: true,
        message: 'Comment replies retrieved successfully',
        data: {
          replies: result.comments,
          pagination: result.pagination,
          parentComment: {
            id: parentComment._id,
            content: parentComment.content,
            author: parentComment.author
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Delete comment
   * DELETE /api/admin/comments/:commentId
   * 
   * Allows admins to delete any comment.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async adminDeleteComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;

      logger.info('Admin delete comment request', { 
        commentId, 
        adminId: userId,
        adminRole: req.user.role 
      });

      const result = await commentService.deleteComment(commentId, userId, true);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CommentController();
