/**
 * Post Service
 * 
 * This service handles all post-related business logic operations.
 * It manages the complete lifecycle of posts including creation, updates,
 * deletion, publishing, interactions, and content moderation.
 * 
 * Features:
 * - Post CRUD operations with validation
 * - Publishing workflow with draft/published states
 * - Social interactions (likes, shares, bookmarks)
 * - Content moderation and filtering
 * - Advanced search and filtering with pagination
 * - SEO optimization and metadata
 * - Media handling and content processing
 * - Analytics and engagement tracking
 * 
 * Learning Notes:
 * - Services encapsulate business logic
 * - They interact with multiple models when needed
 * - Complex operations are broken into smaller methods
 * - Error handling uses custom error classes
 * - Logging is integrated for monitoring and debugging
 */

const Post = require('../models/Post');
const User = require('../models/User');
const Comment = require('../models/Comment');
const { 
  NotFoundError, 
  ValidationError, 
  ForbiddenError,
  ConflictError 
} = require('../utils/errors');
const logger = require('../utils/logger');

class PostService {
  /**
   * Create a new post
   * Handles post creation with content validation and processing
   * 
   * @param {Object} postData - Post creation data
   * @param {string} authorId - ID of the post author
   * @returns {Promise<Object>} Created post object
   */
  async createPost(postData, authorId) {
    logger.info('Creating new post', { authorId, title: postData.title });

    // Verify author exists
    const author = await User.findById(authorId);
    if (!author) {
      throw new NotFoundError('Author not found');
    }

    // Process content and extract metadata
    const processedContent = this._processContent(postData.content);
    
    // Generate slug from title
    const slug = this._generateSlug(postData.title);
    
    // Check if slug already exists for this author
    const existingPost = await Post.findOne({ 
      author: authorId, 
      slug: slug 
    });
    
    if (existingPost) {
      // Append timestamp to make slug unique
      postData.slug = `${slug}-${Date.now()}`;
    } else {
      postData.slug = slug;
    }

    // Prepare post data
    const newPostData = {
      ...postData,
      author: authorId,
      content: processedContent.content,
      excerpt: processedContent.excerpt,
      readingTime: processedContent.readingTime,
      wordCount: processedContent.wordCount,
      status: postData.status || 'draft',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Handle tags processing
    if (postData.tags && postData.tags.length > 0) {
      newPostData.tags = this._processTags(postData.tags);
    }

    // Handle media processing
    if (postData.media && postData.media.length > 0) {
      newPostData.media = this._processMedia(postData.media);
    }

    // Create the post
    const post = new Post(newPostData);
    await post.save();

    // Populate author information
    await post.populate('author', 'username displayName avatar isVerified');

    logger.info('Post created successfully', { 
      postId: post._id, 
      authorId, 
      status: post.status 
    });

    return post;
  }

  /**
   * Get post by ID with population and view tracking
   * 
   * @param {string} postId - Post ID to retrieve
   * @param {string} userId - ID of requesting user (optional)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Post object with populated data
   */
  async getPostById(postId, userId = null, options = {}) {
    logger.info('Fetching post by ID', { postId, userId });

    const query = Post.findById(postId);

    // Always populate author
    query.populate('author', 'username displayName avatar isVerified role');

    // Conditionally populate comments based on options
    if (options.includeComments) {
      query.populate({
        path: 'comments',
        populate: {
          path: 'author',
          select: 'username displayName avatar isVerified'
        },
        options: {
          sort: { createdAt: -1 },
          limit: options.commentLimit || 10
        }
      });
    }

    const post = await query.lean();

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    // Check if post is accessible by user
    if (!this._canAccessPost(post, userId)) {
      throw new ForbiddenError('Access denied to this post');
    }

    // Track view if user is different from author
    if (userId && userId !== post.author._id.toString()) {
      await this._trackPostView(postId, userId);
    }

    // Add user-specific data if authenticated
    if (userId) {
      post.userInteractions = await this._getUserInteractions(postId, userId);
    }

    return post;
  }

  /**
   * Update post
   * Handles post updates with validation and permission checks
   * 
   * @param {string} postId - Post ID to update
   * @param {Object} updateData - Data to update
   * @param {string} userId - ID of requesting user
   * @returns {Promise<Object>} Updated post object
   */
  async updatePost(postId, updateData, userId) {
    logger.info('Updating post', { postId, userId });

    const post = await Post.findById(postId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    // Check permissions
    if (!this._canEditPost(post, userId)) {
      throw new ForbiddenError('You do not have permission to edit this post');
    }

    // Process content if being updated
    if (updateData.content) {
      const processedContent = this._processContent(updateData.content);
      updateData.content = processedContent.content;
      updateData.excerpt = processedContent.excerpt;
      updateData.readingTime = processedContent.readingTime;
      updateData.wordCount = processedContent.wordCount;
    }

    // Update slug if title changed
    if (updateData.title && updateData.title !== post.title) {
      const newSlug = this._generateSlug(updateData.title);
      const existingPost = await Post.findOne({ 
        author: post.author, 
        slug: newSlug,
        _id: { $ne: postId }
      });
      
      if (existingPost) {
        updateData.slug = `${newSlug}-${Date.now()}`;
      } else {
        updateData.slug = newSlug;
      }
    }

    // Process tags if provided
    if (updateData.tags) {
      updateData.tags = this._processTags(updateData.tags);
    }

    // Update timestamp
    updateData.updatedAt = new Date();

    // If publishing for the first time, set published date
    if (updateData.status === 'published' && post.status !== 'published') {
      updateData.publishedAt = new Date();
    }

    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('author', 'username displayName avatar isVerified');

    logger.info('Post updated successfully', { postId, userId });
    return updatedPost;
  }

  /**
   * Delete post
   * Handles post deletion with permission checks and cleanup
   * 
   * @param {string} postId - Post ID to delete
   * @param {string} userId - ID of requesting user
   * @param {boolean} isAdmin - Whether requester is admin
   * @returns {Promise<Object>} Deletion result
   */
  async deletePost(postId, userId, isAdmin = false) {
    logger.info('Deleting post', { postId, userId, isAdmin });

    const post = await Post.findById(postId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    // Check permissions
    if (!isAdmin && post.author.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to delete this post');
    }

    // TODO: Handle related data cleanup
    // - Delete associated comments
    // - Remove from user bookmarks
    // - Clean up media files
    // - Remove from search indices

    // For now, use soft delete
    await Post.findByIdAndUpdate(postId, {
      status: 'deleted',
      deletedAt: new Date()
    });

    logger.info('Post deleted successfully', { postId, userId });
    return { success: true, message: 'Post deleted successfully' };
  }

  /**
   * Get posts with advanced filtering and pagination
   * Supports multiple filter options and sorting
   * 
   * @param {Object} filters - Filter criteria
   * @param {Object} pagination - Pagination options
   * @param {string} userId - ID of requesting user (optional)
   * @returns {Promise<Object>} Posts with pagination metadata
   */
  async getPosts(filters = {}, pagination = {}, userId = null) {
    const {
      author,
      category,
      tags,
      status = 'published',
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      featured,
      dateFrom,
      dateTo
    } = filters;

    const {
      page = 1,
      limit = 20,
      offset = 0
    } = pagination;

    logger.info('Fetching posts with filters', { filters, pagination, userId });

    // Build filter query
    const query = {};

    // Status filter
    if (Array.isArray(status)) {
      query.status = { $in: status };
    } else {
      query.status = status;
    }

    // Author filter
    if (author) {
      query.author = author;
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Tags filter
    if (tags && tags.length > 0) {
      if (Array.isArray(tags)) {
        query.tags = { $in: tags };
      } else {
        query.tags = tags;
      }
    }

    // Featured filter
    if (typeof featured === 'boolean') {
      query.featured = featured;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.createdAt.$lte = new Date(dateTo);
      }
    }

    // Text search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const [posts, total] = await Promise.all([
      Post.find(query)
        .populate('author', 'username displayName avatar isVerified')
        .sort(sort)
        .skip(offset || (page - 1) * limit)
        .limit(limit)
        .lean(),
      Post.countDocuments(query)
    ]);

    // Add user interactions if authenticated
    if (userId) {
      for (const post of posts) {
        post.userInteractions = await this._getUserInteractions(post._id, userId);
      }
    }

    const totalPages = Math.ceil(total / limit);

    return {
      posts,
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
   * Like/unlike a post
   * Toggles like status and updates counts
   * 
   * @param {string} postId - Post ID to like/unlike
   * @param {string} userId - ID of user performing action
   * @returns {Promise<Object>} Like operation result
   */
  async toggleLike(postId, userId) {
    logger.info('Toggling post like', { postId, userId });

    const post = await Post.findById(postId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    const isLiked = post.likes.includes(userId);

    if (isLiked) {
      // Unlike the post
      await Post.findByIdAndUpdate(postId, {
        $pull: { likes: userId },
        $inc: { likeCount: -1 }
      });
      
      logger.info('Post unliked', { postId, userId });
      return { isLiked: false, message: 'Post unliked successfully' };
    } else {
      // Like the post
      await Post.findByIdAndUpdate(postId, {
        $addToSet: { likes: userId },
        $inc: { likeCount: 1 }
      });
      
      // TODO: Create notification for post author
      // await this.notificationService.createLikeNotification(userId, post.author, postId);
      
      logger.info('Post liked', { postId, userId });
      return { isLiked: true, message: 'Post liked successfully' };
    }
  }

  /**
   * Bookmark/unbookmark a post
   * Manages user's bookmarked posts
   * 
   * @param {string} postId - Post ID to bookmark/unbookmark
   * @param {string} userId - ID of user performing action
   * @returns {Promise<Object>} Bookmark operation result
   */
  async toggleBookmark(postId, userId) {
    logger.info('Toggling post bookmark', { postId, userId });

    const post = await Post.findById(postId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    const user = await User.findById(userId);
    const isBookmarked = user.bookmarks.includes(postId);

    if (isBookmarked) {
      // Remove bookmark
      await User.findByIdAndUpdate(userId, {
        $pull: { bookmarks: postId }
      });
      
      logger.info('Post unbookmarked', { postId, userId });
      return { isBookmarked: false, message: 'Post removed from bookmarks' };
    } else {
      // Add bookmark
      await User.findByIdAndUpdate(userId, {
        $addToSet: { bookmarks: postId }
      });
      
      logger.info('Post bookmarked', { postId, userId });
      return { isBookmarked: true, message: 'Post added to bookmarks' };
    }
  }

  /**
   * Get user's bookmarked posts
   * Returns paginated list of bookmarked posts
   * 
   * @param {string} userId - User ID
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Bookmarked posts with pagination
   */
  async getUserBookmarks(userId, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    logger.info('Fetching user bookmarks', { userId, pagination });

    const user = await User.findById(userId)
      .populate({
        path: 'bookmarks',
        populate: {
          path: 'author',
          select: 'username displayName avatar isVerified'
        },
        options: {
          sort: { createdAt: -1 },
          skip: offset,
          limit: limit
        }
      })
      .lean();

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const total = user.bookmarks.length;
    const totalPages = Math.ceil(total / limit);

    return {
      bookmarks: user.bookmarks,
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
   * Get trending posts
   * Returns posts with high engagement in recent time period
   * 
   * @param {Object} options - Trending calculation options
   * @returns {Promise<Array>} Array of trending posts
   */
  async getTrendingPosts(options = {}) {
    const {
      timeframe = '24h', // 24h, 7d, 30d
      limit = 10,
      category = null
    } = options;

    logger.info('Fetching trending posts', { timeframe, limit, category });

    // Calculate date threshold
    const now = new Date();
    let dateThreshold;
    
    switch (timeframe) {
      case '7d':
        dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        dateThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default: // 24h
        dateThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const matchStage = {
      status: 'published',
      createdAt: { $gte: dateThreshold }
    };

    if (category) {
      matchStage.category = category;
    }

    // Aggregate posts with engagement score
    const trendingPosts = await Post.aggregate([
      { $match: matchStage },
      {
        $addFields: {
          // Calculate engagement score based on likes, comments, views
          engagementScore: {
            $add: [
              { $multiply: ['$likeCount', 3] }, // Likes weight: 3
              { $multiply: ['$commentCount', 5] }, // Comments weight: 5
              { $multiply: ['$viewCount', 1] }, // Views weight: 1
              { $multiply: ['$shareCount', 4] } // Shares weight: 4
            ]
          }
        }
      },
      { $sort: { engagementScore: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
          pipeline: [
            { $project: { username: 1, displayName: 1, avatar: 1, isVerified: 1 } }
          ]
        }
      },
      { $unwind: '$author' }
    ]);

    return trendingPosts;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Process post content
   * Extracts metadata, generates excerpt, calculates reading time
   * 
   * @param {string} content - Raw post content
   * @returns {Object} Processed content data
   */
  _processContent(content) {
    // Remove HTML tags for word count and excerpt
    const textContent = content.replace(/<[^>]*>/g, '');
    
    // Calculate word count
    const wordCount = textContent.trim().split(/\s+/).length;
    
    // Calculate reading time (average 200 words per minute)
    const readingTime = Math.ceil(wordCount / 200);
    
    // Generate excerpt (first 200 characters)
    const excerpt = textContent.substring(0, 200) + (textContent.length > 200 ? '...' : '');

    return {
      content,
      excerpt,
      wordCount,
      readingTime
    };
  }

  /**
   * Generate URL-friendly slug from title
   * 
   * @param {string} title - Post title
   * @returns {string} URL-friendly slug
   */
  _generateSlug(title) {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .substring(0, 100); // Limit length
  }

  /**
   * Process and validate tags
   * 
   * @param {Array} tags - Array of tag strings
   * @returns {Array} Processed tags
   */
  _processTags(tags) {
    return tags
      .map(tag => tag.toLowerCase().trim())
      .filter(tag => tag.length > 0 && tag.length <= 30)
      .slice(0, 10); // Limit to 10 tags
  }

  /**
   * Process media attachments
   * 
   * @param {Array} media - Array of media objects
   * @returns {Array} Processed media
   */
  _processMedia(media) {
    // TODO: Implement media processing
    // - Validate file types
    // - Generate thumbnails
    // - Upload to cloud storage
    // - Return processed media objects
    return media;
  }

  /**
   * Check if user can access post
   * 
   * @param {Object} post - Post object
   * @param {string} userId - User ID
   * @returns {boolean} Access permission
   */
  _canAccessPost(post, userId) {
    // Published posts are accessible to everyone
    if (post.status === 'published') {
      return true;
    }

    // Draft posts only accessible to author
    if (post.status === 'draft') {
      return userId && post.author._id.toString() === userId;
    }

    // Private posts only accessible to author
    if (post.status === 'private') {
      return userId && post.author._id.toString() === userId;
    }

    return false;
  }

  /**
   * Check if user can edit post
   * 
   * @param {Object} post - Post object
   * @param {string} userId - User ID
   * @returns {boolean} Edit permission
   */
  _canEditPost(post, userId) {
    return post.author.toString() === userId;
  }

  /**
   * Track post view
   * 
   * @param {string} postId - Post ID
   * @param {string} userId - User ID
   */
  async _trackPostView(postId, userId) {
    // Increment view count
    await Post.findByIdAndUpdate(postId, {
      $inc: { viewCount: 1 }
    });

    // TODO: Track individual view in analytics collection
    // This would include timestamp, user, IP, etc.
  }

  /**
   * Get user interactions with post
   * 
   * @param {string} postId - Post ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User interaction data
   */
  async _getUserInteractions(postId, userId) {
    const [post, user] = await Promise.all([
      Post.findById(postId).select('likes').lean(),
      User.findById(userId).select('bookmarks').lean()
    ]);

    return {
      isLiked: post?.likes?.includes(userId) || false,
      isBookmarked: user?.bookmarks?.includes(postId) || false
    };
  }
}

module.exports = new PostService();
