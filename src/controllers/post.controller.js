/**
 * Post Controller
 * 
 * This controller handles all post-related HTTP requests and responses.
 * It implements the controller layer of the MVC pattern, managing:
 * - HTTP request/response handling
 * - Input validation using Zod schemas
 * - Business logic delegation to services
 * - Consistent response formatting
 * - Error handling and logging
 * 
 * Endpoints:
 * - POST /api/posts - Create new post
 * - GET /api/posts - Get posts with filtering/pagination
 * - GET /api/posts/:postId - Get specific post
 * - PUT /api/posts/:postId - Update post
 * - DELETE /api/posts/:postId - Delete post
 * - POST /api/posts/:postId/like - Like/unlike post
 * - POST /api/posts/:postId/bookmark - Bookmark/unbookmark post
 * - GET /api/posts/trending - Get trending posts
 * - GET /api/posts/bookmarks - Get user's bookmarks
 * 
 * Learning Notes:
 * - Controllers handle HTTP concerns, not business logic
 * - Input validation occurs before service calls
 * - Response format is consistent across all endpoints
 * - Error handling is delegated to middleware
 * - Logging provides insight into API usage
 */

const postService = require('../services/post.service');
const { 
  postCreateSchema,
  postUpdateSchema, 
  postQuerySchema,
  paginationSchema 
} = require('../validators/schemas');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

class PostController {
  /**
   * Create new post
   * POST /api/posts
   * 
   * Creates a new post with content validation and processing.
   * Handles both draft and published posts.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async createPost(req, res, next) {
    try {
      const authorId = req.user.id;
      const postData = req.body;

      logger.info('Create post request', { 
        authorId, 
        title: postData.title,
        status: postData.status 
      });

      // Validate input data
      const validationResult = postCreateSchema.safeParse(postData);
      if (!validationResult.success) {
        throw new ValidationError(
          'Invalid post data',
          validationResult.error.issues
        );
      }

      const newPost = await postService.createPost(
        validationResult.data,
        authorId
      );

      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        data: {
          post: newPost
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get posts with filtering and pagination
   * GET /api/posts
   * 
   * Returns posts based on query parameters with filtering,
   * sorting, and pagination support.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPosts(req, res, next) {
    try {
      const queryParams = req.query;
      const userId = req.user?.id;

      logger.info('Get posts request', { 
        query: queryParams,
        userId 
      });

      // Validate query parameters
      const queryValidation = postQuerySchema.safeParse(queryParams);
      if (!queryValidation.success) {
        throw new ValidationError(
          'Invalid query parameters',
          queryValidation.error.issues
        );
      }

      // Validate pagination parameters
      const paginationValidation = paginationSchema.safeParse(queryParams);
      if (!paginationValidation.success) {
        throw new ValidationError(
          'Invalid pagination parameters',
          paginationValidation.error.issues
        );
      }

      const result = await postService.getPosts(
        queryValidation.data,
        paginationValidation.data,
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Posts retrieved successfully',
        data: {
          posts: result.posts,
          pagination: result.pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get specific post by ID
   * GET /api/posts/:postId
   * 
   * Returns detailed post information including author data,
   * user interactions, and optionally comments.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPostById(req, res, next) {
    try {
      const { postId } = req.params;
      const userId = req.user?.id;
      const { includeComments = 'false' } = req.query;

      logger.info('Get post by ID request', { 
        postId, 
        userId,
        includeComments 
      });

      const options = {
        includeComments: includeComments === 'true',
        commentLimit: 10
      };

      const post = await postService.getPostById(postId, userId, options);

      res.status(200).json({
        success: true,
        message: 'Post retrieved successfully',
        data: {
          post
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update post
   * PUT /api/posts/:postId
   * 
   * Updates post content, metadata, or status.
   * Only post author can update their posts.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updatePost(req, res, next) {
    try {
      const { postId } = req.params;
      const userId = req.user.id;
      const updateData = req.body;

      logger.info('Update post request', { 
        postId, 
        userId,
        fields: Object.keys(updateData) 
      });

      // Validate update data
      const validationResult = postUpdateSchema.safeParse(updateData);
      if (!validationResult.success) {
        throw new ValidationError(
          'Invalid update data',
          validationResult.error.issues
        );
      }

      const updatedPost = await postService.updatePost(
        postId,
        validationResult.data,
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Post updated successfully',
        data: {
          post: updatedPost
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete post
   * DELETE /api/posts/:postId
   * 
   * Deletes a post (soft delete). Only post author can delete their posts.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deletePost(req, res, next) {
    try {
      const { postId } = req.params;
      const userId = req.user.id;

      logger.info('Delete post request', { postId, userId });

      const result = await postService.deletePost(postId, userId, false);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Like/unlike post
   * POST /api/posts/:postId/like
   * 
   * Toggles like status for a post. Updates like count and user's like list.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async toggleLike(req, res, next) {
    try {
      const { postId } = req.params;
      const userId = req.user.id;

      logger.info('Toggle post like request', { postId, userId });

      const result = await postService.toggleLike(postId, userId);

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
   * Bookmark/unbookmark post
   * POST /api/posts/:postId/bookmark
   * 
   * Toggles bookmark status for a post. Manages user's bookmark collection.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async toggleBookmark(req, res, next) {
    try {
      const { postId } = req.params;
      const userId = req.user.id;

      logger.info('Toggle post bookmark request', { postId, userId });

      const result = await postService.toggleBookmark(postId, userId);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          isBookmarked: result.isBookmarked
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's bookmarked posts
   * GET /api/posts/bookmarks
   * 
   * Returns paginated list of posts bookmarked by the authenticated user.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getUserBookmarks(req, res, next) {
    try {
      const userId = req.user.id;
      const queryParams = req.query;

      logger.info('Get user bookmarks request', { userId, query: queryParams });

      // Validate pagination parameters
      const paginationValidation = paginationSchema.safeParse(queryParams);
      if (!paginationValidation.success) {
        throw new ValidationError(
          'Invalid pagination parameters',
          paginationValidation.error.issues
        );
      }

      const result = await postService.getUserBookmarks(
        userId,
        paginationValidation.data
      );

      res.status(200).json({
        success: true,
        message: 'Bookmarks retrieved successfully',
        data: {
          bookmarks: result.bookmarks,
          pagination: result.pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get trending posts
   * GET /api/posts/trending
   * 
   * Returns posts with high engagement in specified timeframe.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getTrendingPosts(req, res, next) {
    try {
      const { 
        timeframe = '24h', 
        limit = 10, 
        category 
      } = req.query;

      logger.info('Get trending posts request', { 
        timeframe, 
        limit, 
        category 
      });

      // Validate timeframe
      const validTimeframes = ['24h', '7d', '30d'];
      if (!validTimeframes.includes(timeframe)) {
        throw new ValidationError('Invalid timeframe. Must be one of: 24h, 7d, 30d');
      }

      // Validate limit
      const limitNum = parseInt(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
        throw new ValidationError('Invalid limit. Must be between 1 and 50');
      }

      const trendingPosts = await postService.getTrendingPosts({
        timeframe,
        limit: limitNum,
        category
      });

      res.status(200).json({
        success: true,
        message: 'Trending posts retrieved successfully',
        data: {
          posts: trendingPosts,
          timeframe,
          category: category || 'all'
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get posts by author
   * GET /api/posts/author/:authorId
   * 
   * Returns posts written by a specific author with pagination.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPostsByAuthor(req, res, next) {
    try {
      const { authorId } = req.params;
      const queryParams = req.query;
      const userId = req.user?.id;

      logger.info('Get posts by author request', { 
        authorId, 
        userId,
        query: queryParams 
      });

      // Build filters with author
      const filters = {
        ...queryParams,
        author: authorId,
        // Show only published posts unless viewing own posts
        status: (userId === authorId) ? ['published', 'draft'] : 'published'
      };

      // Validate pagination parameters
      const paginationValidation = paginationSchema.safeParse(queryParams);
      if (!paginationValidation.success) {
        throw new ValidationError(
          'Invalid pagination parameters',
          paginationValidation.error.issues
        );
      }

      const result = await postService.getPosts(
        filters,
        paginationValidation.data,
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Author posts retrieved successfully',
        data: {
          posts: result.posts,
          pagination: result.pagination,
          author: authorId
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Delete post
   * DELETE /api/admin/posts/:postId
   * 
   * Allows admins to delete any post regardless of ownership.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async adminDeletePost(req, res, next) {
    try {
      const { postId } = req.params;
      const userId = req.user.id;

      logger.info('Admin delete post request', { 
        postId, 
        adminId: userId,
        adminRole: req.user.role 
      });

      const result = await postService.deletePost(postId, userId, true);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get post analytics
   * GET /api/posts/:postId/analytics
   * 
   * Returns detailed analytics for a post (views, likes, shares, etc.).
   * Only accessible by post author or admins.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getPostAnalytics(req, res, next) {
    try {
      const { postId } = req.params;
      const userId = req.user.id;

      logger.info('Get post analytics request', { postId, userId });

      // TODO: Implement analytics service
      // For now, return basic analytics from post model
      const post = await postService.getPostById(postId, userId);

      // Check if user can view analytics (post author or admin)
      if (post.author._id.toString() !== userId && req.user.role !== 'admin') {
        throw new ForbiddenError('You do not have permission to view post analytics');
      }

      const analytics = {
        postId: post._id,
        title: post.title,
        views: post.viewCount || 0,
        likes: post.likeCount || 0,
        comments: post.commentCount || 0,
        shares: post.shareCount || 0,
        publishedAt: post.publishedAt,
        performance: {
          engagementRate: post.likeCount && post.viewCount 
            ? ((post.likeCount + post.commentCount) / post.viewCount * 100).toFixed(2) + '%'
            : '0%'
        }
      };

      res.status(200).json({
        success: true,
        message: 'Post analytics retrieved successfully',
        data: {
          analytics
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PostController();
