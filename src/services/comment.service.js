/**
 * Comment Service
 * 
 * This service handles all comment-related business logic operations.
 * It manages the complete lifecycle of comments including creation, updates,
 * deletion, nested threading, moderation, and social interactions.
 * 
 * Features:
 * - Comment CRUD operations with validation
 * - Nested/threaded comment system
 * - Comment moderation and filtering
 * - Social interactions (likes, replies)
 * - User mentions and notifications
 * - Pagination and sorting
 * - Content safety and spam prevention
 * 
 * Learning Notes:
 * - Services handle complex business logic
 * - Nested comments require careful tree management
 * - User interactions affect multiple models
 * - Moderation is crucial for content safety
 * - Performance considerations for deep nesting
 */

const Comment = require('../models/Comment');
const Post = require('../models/Post');
const User = require('../models/User');
const { 
  NotFoundError, 
  ValidationError, 
  ForbiddenError 
} = require('../utils/errors');
const logger = require('../utils/logger');

class CommentService {
  /**
   * Create a new comment
   * Handles comment creation with validation and post association
   * 
   * @param {Object} commentData - Comment creation data
   * @param {string} authorId - ID of the comment author
   * @param {string} postId - ID of the post being commented on
   * @returns {Promise<Object>} Created comment object
   */
  async createComment(commentData, authorId, postId) {
    logger.info('Creating new comment', { authorId, postId });

    // Verify post exists and allows comments
    const post = await Post.findById(postId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    if (!post.allowComments) {
      throw new ForbiddenError('Comments are disabled for this post');
    }

    // Verify author exists
    const author = await User.findById(authorId);
    if (!author) {
      throw new NotFoundError('Author not found');
    }

    // If this is a reply, verify parent comment exists
    let parentComment = null;
    if (commentData.parentComment) {
      parentComment = await Comment.findById(commentData.parentComment);
      if (!parentComment) {
        throw new NotFoundError('Parent comment not found');
      }

      // Ensure parent comment belongs to the same post
      if (parentComment.post.toString() !== postId) {
        throw new ValidationError('Parent comment does not belong to this post');
      }

      // Limit nesting depth (prevent deeply nested threads)
      if (parentComment.depth >= 5) {
        throw new ValidationError('Maximum comment nesting depth reached');
      }
    }

    // Process mentions if any
    const processedMentions = await this._processMentions(commentData.mentions || []);

    // Determine comment depth
    const depth = parentComment ? parentComment.depth + 1 : 0;

    // Prepare comment data
    const newCommentData = {
      content: commentData.content,
      author: authorId,
      post: postId,
      parentComment: commentData.parentComment || null,
      mentions: processedMentions,
      depth,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create the comment
    const comment = new Comment(newCommentData);
    await comment.save();

    // Update post comment count
    await Post.findByIdAndUpdate(postId, {
      $inc: { commentCount: 1 }
    });

    // Update parent comment reply count if this is a reply
    if (parentComment) {
      await Comment.findByIdAndUpdate(commentData.parentComment, {
        $inc: { replyCount: 1 }
      });
    }

    // Populate author information
    await comment.populate('author', 'username displayName avatar isVerified');

    // TODO: Create notifications
    // - Notify post author about new comment
    // - Notify mentioned users
    // - Notify parent comment author about reply

    logger.info('Comment created successfully', { 
      commentId: comment._id, 
      authorId, 
      postId 
    });

    return comment;
  }

  /**
   * Get comments for a post with pagination and threading
   * 
   * @param {string} postId - Post ID to get comments for
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Comments with pagination metadata
   */
  async getPostComments(postId, options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      parentComment = null // For getting replies to specific comment
    } = options;

    logger.info('Fetching post comments', { postId, options });

    // Verify post exists
    const post = await Post.findById(postId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    // Build query
    const query = {
      post: postId,
      parentComment: parentComment // null for top-level comments
    };

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const offset = (page - 1) * limit;

    // Execute query with pagination
    const [comments, total] = await Promise.all([
      Comment.find(query)
        .populate('author', 'username displayName avatar isVerified')
        .populate({
          path: 'mentions',
          select: 'username displayName'
        })
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .lean(),
      Comment.countDocuments(query)
    ]);

    // If we're getting top-level comments, also fetch recent replies for each
    if (!parentComment && comments.length > 0) {
      for (const comment of comments) {
        if (comment.replyCount > 0) {
          comment.recentReplies = await Comment.find({
            parentComment: comment._id
          })
            .populate('author', 'username displayName avatar isVerified')
            .sort({ createdAt: -1 })
            .limit(3) // Get 3 most recent replies
            .lean();
        }
      }
    }

    const totalPages = Math.ceil(total / limit);

    return {
      comments,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }

  /**
   * Get comment by ID with population
   * 
   * @param {string} commentId - Comment ID to retrieve
   * @param {string} userId - ID of requesting user (optional)
   * @returns {Promise<Object>} Comment object
   */
  async getCommentById(commentId, userId = null) {
    logger.info('Fetching comment by ID', { commentId, userId });

    const comment = await Comment.findById(commentId)
      .populate('author', 'username displayName avatar isVerified')
      .populate('post', 'title author allowComments')
      .populate({
        path: 'mentions',
        select: 'username displayName'
      })
      .lean();

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Add user-specific data if authenticated
    if (userId) {
      comment.userInteractions = await this._getUserInteractions(commentId, userId);
    }

    // Get recent replies if this is a parent comment
    if (comment.replyCount > 0) {
      comment.recentReplies = await Comment.find({
        parentComment: commentId
      })
        .populate('author', 'username displayName avatar isVerified')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
    }

    return comment;
  }

  /**
   * Update comment
   * Handles comment updates with permission checks
   * 
   * @param {string} commentId - Comment ID to update
   * @param {Object} updateData - Data to update
   * @param {string} userId - ID of requesting user
   * @returns {Promise<Object>} Updated comment object
   */
  async updateComment(commentId, updateData, userId) {
    logger.info('Updating comment', { commentId, userId });

    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Check permissions (only author can edit their comments)
    if (comment.author.toString() !== userId) {
      throw new ForbiddenError('You can only edit your own comments');
    }

    // Check if comment is still editable (e.g., within 24 hours)
    const editTimeLimit = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const timeSinceCreation = Date.now() - comment.createdAt.getTime();
    
    if (timeSinceCreation > editTimeLimit) {
      throw new ForbiddenError('Comment can no longer be edited');
    }

    // Process mentions if being updated
    if (updateData.mentions) {
      updateData.mentions = await this._processMentions(updateData.mentions);
    }

    // Update timestamp and edited flag
    updateData.updatedAt = new Date();
    updateData.edited = true;

    const updatedComment = await Comment.findByIdAndUpdate(
      commentId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('author', 'username displayName avatar isVerified');

    logger.info('Comment updated successfully', { commentId, userId });
    return updatedComment;
  }

  /**
   * Delete comment
   * Handles comment deletion with cleanup and permission checks
   * 
   * @param {string} commentId - Comment ID to delete
   * @param {string} userId - ID of requesting user
   * @param {boolean} isAdmin - Whether requester is admin
   * @returns {Promise<Object>} Deletion result
   */
  async deleteComment(commentId, userId, isAdmin = false) {
    logger.info('Deleting comment', { commentId, userId, isAdmin });

    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Check permissions
    if (!isAdmin && comment.author.toString() !== userId) {
      throw new ForbiddenError('You can only delete your own comments');
    }

    // Handle nested comment deletion strategy
    if (comment.replyCount > 0) {
      // If comment has replies, don't delete it completely
      // Instead, mark it as deleted but keep the structure
      await Comment.findByIdAndUpdate(commentId, {
        content: '[This comment has been deleted]',
        deleted: true,
        deletedAt: new Date()
      });

      logger.info('Comment marked as deleted (has replies)', { commentId });
      return { success: true, message: 'Comment deleted successfully' };
    } else {
      // If no replies, safe to delete completely
      await Comment.findByIdAndDelete(commentId);

      // Update post comment count
      await Post.findByIdAndUpdate(comment.post, {
        $inc: { commentCount: -1 }
      });

      // Update parent comment reply count if this was a reply
      if (comment.parentComment) {
        await Comment.findByIdAndUpdate(comment.parentComment, {
          $inc: { replyCount: -1 }
        });
      }

      logger.info('Comment deleted completely', { commentId });
      return { success: true, message: 'Comment deleted successfully' };
    }
  }

  /**
   * Like/unlike a comment
   * Toggles like status and updates counts
   * 
   * @param {string} commentId - Comment ID to like/unlike
   * @param {string} userId - ID of user performing action
   * @returns {Promise<Object>} Like operation result
   */
  async toggleLike(commentId, userId) {
    logger.info('Toggling comment like', { commentId, userId });

    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    const isLiked = comment.likes.includes(userId);

    if (isLiked) {
      // Unlike the comment
      await Comment.findByIdAndUpdate(commentId, {
        $pull: { likes: userId },
        $inc: { likeCount: -1 }
      });
      
      logger.info('Comment unliked', { commentId, userId });
      return { isLiked: false, message: 'Comment unliked successfully' };
    } else {
      // Like the comment
      await Comment.findByIdAndUpdate(commentId, {
        $addToSet: { likes: userId },
        $inc: { likeCount: 1 }
      });
      
      // TODO: Create notification for comment author
      // await this.notificationService.createCommentLikeNotification(userId, comment.author, commentId);
      
      logger.info('Comment liked', { commentId, userId });
      return { isLiked: true, message: 'Comment liked successfully' };
    }
  }

  /**
   * Report comment for moderation
   * 
   * @param {string} commentId - Comment ID to report
   * @param {string} userId - ID of user reporting
   * @param {string} reason - Reason for reporting
   * @returns {Promise<Object>} Report result
   */
  async reportComment(commentId, userId, reason) {
    logger.info('Reporting comment', { commentId, userId, reason });

    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Check if user already reported this comment
    const existingReport = comment.reports.find(
      report => report.reporter.toString() === userId
    );

    if (existingReport) {
      throw new ValidationError('You have already reported this comment');
    }

    // Add report
    await Comment.findByIdAndUpdate(commentId, {
      $push: {
        reports: {
          reporter: userId,
          reason,
          createdAt: new Date()
        }
      },
      $inc: { reportCount: 1 }
    });

    // TODO: Implement auto-moderation logic
    // - Hide comment if it reaches certain report threshold
    // - Notify administrators
    // - Apply content filters

    logger.info('Comment reported successfully', { commentId, userId, reason });
    return { success: true, message: 'Comment reported successfully' };
  }

  /**
   * Get user's recent comments with pagination
   * 
   * @param {string} userId - User ID
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} User comments with pagination
   */
  async getUserComments(userId, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    logger.info('Fetching user comments', { userId, pagination });

    const [comments, total] = await Promise.all([
      Comment.find({ author: userId })
        .populate('post', 'title slug author')
        .populate('author', 'username displayName avatar isVerified')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Comment.countDocuments({ author: userId })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      comments,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Process user mentions in comment content
   * 
   * @param {Array} mentions - Array of user IDs mentioned
   * @returns {Promise<Array>} Validated user IDs
   */
  async _processMentions(mentions) {
    if (!mentions || mentions.length === 0) {
      return [];
    }

    // Verify all mentioned users exist
    const users = await User.find({
      _id: { $in: mentions }
    }).select('_id');

    const validUserIds = users.map(user => user._id);

    // Log if some mentions were invalid
    if (validUserIds.length !== mentions.length) {
      logger.warn('Some user mentions were invalid', {
        requested: mentions,
        valid: validUserIds
      });
    }

    return validUserIds;
  }

  /**
   * Get user interactions with comment
   * 
   * @param {string} commentId - Comment ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User interaction data
   */
  async _getUserInteractions(commentId, userId) {
    const comment = await Comment.findById(commentId).select('likes').lean();

    return {
      isLiked: comment?.likes?.includes(userId) || false
    };
  }
}

module.exports = new CommentService();
