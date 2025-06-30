/**
 * Admin Service
 * 
 * This service handles all admin-related business logic operations.
 * It provides administrative functions for user management, content moderation,
 * analytics, and system administration tasks.
 * 
 * Features:
 * - User management (view all, ban/unban, role changes)
 * - Content moderation (delete posts/comments, handle reports)
 * - Analytics and reporting
 * - System health monitoring
 * - Bulk operations and data exports
 * - Activity logging and audit trails
 * 
 * Security Notes:
 * - All operations require admin role verification
 * - Sensitive operations are logged for audit
 * - Rate limiting applies even to admin operations
 * - Admin actions cannot be performed on other admins
 * 
 * Learning Notes:
 * - Admin services handle privileged operations
 * - Comprehensive logging for accountability
 * - Analytics provide insights for decision making
 * - Security is paramount for admin functions
 */

const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Token = require('../models/Token');
const { 
  NotFoundError, 
  ValidationError, 
  ForbiddenError 
} = require('../utils/errors');
const logger = require('../utils/logger');

class AdminService {
  /**
   * Get all users with filtering and pagination
   * Admin-only function to view all users in the system
   * 
   * @param {Object} filters - Filter criteria
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Users with pagination metadata
   */
  async getAllUsers(filters = {}, pagination = {}) {
    const {
      role,
      isActive,
      isVerified,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = filters;

    const {
      page = 1,
      limit = 20,
      offset = 0
    } = pagination;

    logger.info('Admin: Fetching all users', { filters, pagination });

    // Build filter query
    const query = {};

    if (role) {
      query.role = role;
    }

    if (typeof isActive === 'boolean') {
      query.isActive = isActive;
    }

    if (typeof isVerified === 'boolean') {
      query.isVerified = isVerified;
    }

    // Text search across multiple fields
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const [users, total] = await Promise.all([
      User.find(query)
        .select('username displayName email role isActive isVerified followerCount createdAt lastActive')
        .sort(sort)
        .skip(offset || (page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      users,
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
   * Get all posts with admin details
   * Admin view of all posts including drafts and private posts
   * 
   * @param {Object} filters - Filter criteria
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Posts with pagination metadata
   */
  async getAllPosts(filters = {}, pagination = {}) {
    const {
      status,
      author,
      reported,
      featured,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = filters;

    const {
      page = 1,
      limit = 20,
      offset = 0
    } = pagination;

    logger.info('Admin: Fetching all posts', { filters, pagination });

    // Build filter query
    const query = {};

    if (status) {
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    }

    if (author) {
      query.author = author;
    }

    if (typeof reported === 'boolean' && reported) {
      query.reportCount = { $gt: 0 };
    }

    if (typeof featured === 'boolean') {
      query.featured = featured;
    }

    // Text search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const [posts, total] = await Promise.all([
      Post.find(query)
        .populate('author', 'username displayName email')
        .select('title excerpt status featured reportCount likeCount commentCount viewCount createdAt')
        .sort(sort)
        .skip(offset || (page - 1) * limit)
        .limit(limit)
        .lean(),
      Post.countDocuments(query)
    ]);

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
   * Ban or unban a user
   * Admin function to ban/unban users with reason logging
   * 
   * @param {string} targetUserId - ID of user to ban/unban
   * @param {string} adminId - ID of admin performing action
   * @param {Object} actionData - Action details
   * @returns {Promise<Object>} Action result
   */
  async toggleUserBan(targetUserId, adminId, actionData) {
    const { action, reason, duration } = actionData;

    logger.info('Admin: Toggle user ban', { 
      targetUserId, 
      adminId, 
      action, 
      reason 
    });

    // Get target user
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found');
    }

    // Prevent admin actions on other admins
    if (targetUser.role === 'admin') {
      throw new ForbiddenError('Cannot perform admin actions on other administrators');
    }

    // Prevent self-targeting
    if (targetUserId === adminId) {
      throw new ForbiddenError('Cannot perform admin actions on yourself');
    }

    let updateData = {};
    let message = '';

    if (action === 'ban') {
      updateData = {
        isActive: false,
        bannedAt: new Date(),
        banReason: reason
      };

      if (duration) {
        const banUntil = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
        updateData.banUntil = banUntil;
      }

      message = duration 
        ? `User banned for ${duration} days` 
        : 'User banned permanently';

      // Invalidate all user tokens
      await Token.deleteMany({ user: targetUserId });

    } else if (action === 'unban') {
      updateData = {
        isActive: true,
        $unset: { 
          bannedAt: 1, 
          banReason: 1, 
          banUntil: 1 
        }
      };
      message = 'User unbanned successfully';
    }

    // Update user
    await User.findByIdAndUpdate(targetUserId, updateData);

    // Log admin action for audit
    logger.warn('Admin action performed', {
      action: `user_${action}`,
      adminId,
      targetUserId,
      reason,
      duration,
      timestamp: new Date()
    });

    return {
      success: true,
      message,
      action
    };
  }

  /**
   * Delete post as admin
   * Admin function to delete any post with reason logging
   * 
   * @param {string} postId - ID of post to delete
   * @param {string} adminId - ID of admin performing action
   * @param {string} reason - Reason for deletion
   * @returns {Promise<Object>} Deletion result
   */
  async deletePost(postId, adminId, reason) {
    logger.info('Admin: Delete post', { postId, adminId, reason });

    const post = await Post.findById(postId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    // Soft delete with admin reason
    await Post.findByIdAndUpdate(postId, {
      status: 'deleted',
      deletedAt: new Date(),
      deletedBy: adminId,
      deletionReason: reason
    });

    // Log admin action
    logger.warn('Admin action performed', {
      action: 'post_delete',
      adminId,
      postId,
      postAuthor: post.author,
      reason,
      timestamp: new Date()
    });

    return {
      success: true,
      message: 'Post deleted successfully'
    };
  }

  /**
   * Toggle post featured status
   * Admin function to feature/unfeature posts
   * 
   * @param {string} postId - ID of post to feature/unfeature
   * @param {string} adminId - ID of admin performing action
   * @param {boolean} featured - Whether to feature or unfeature
   * @returns {Promise<Object>} Feature toggle result
   */
  async togglePostFeatured(postId, adminId, featured) {
    logger.info('Admin: Toggle post featured', { postId, adminId, featured });

    const post = await Post.findById(postId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    await Post.findByIdAndUpdate(postId, {
      featured,
      featuredAt: featured ? new Date() : null,
      featuredBy: featured ? adminId : null
    });

    // Log admin action
    logger.info('Admin action performed', {
      action: featured ? 'post_feature' : 'post_unfeature',
      adminId,
      postId,
      timestamp: new Date()
    });

    return {
      success: true,
      message: featured ? 'Post featured successfully' : 'Post unfeatured successfully',
      featured
    };
  }

  /**
   * Get system analytics
   * Admin function to get system-wide statistics
   * 
   * @param {string} timeframe - Time period for analytics
   * @returns {Promise<Object>} System analytics data
   */
  async getSystemAnalytics(timeframe = '30d') {
    logger.info('Admin: Fetching system analytics', { timeframe });

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get analytics data
    const [
      totalUsers,
      totalPosts,
      totalComments,
      newUsers,
      newPosts,
      newComments,
      activeUsers,
      reportedPosts,
      reportedComments
    ] = await Promise.all([
      // Total counts
      User.countDocuments({ isActive: true }),
      Post.countDocuments({ status: 'published' }),
      Comment.countDocuments({}),

      // New items in timeframe
      User.countDocuments({ 
        createdAt: { $gte: startDate },
        isActive: true 
      }),
      Post.countDocuments({ 
        createdAt: { $gte: startDate },
        status: 'published' 
      }),
      Comment.countDocuments({ 
        createdAt: { $gte: startDate } 
      }),

      // Active users (logged in within timeframe)
      User.countDocuments({ 
        lastActive: { $gte: startDate },
        isActive: true 
      }),

      // Reported content
      Post.countDocuments({ reportCount: { $gt: 0 } }),
      Comment.countDocuments({ reportCount: { $gt: 0 } })
    ]);

    // Get top users by followers
    const topUsers = await User.find({ isActive: true })
      .select('username displayName followerCount')
      .sort({ followerCount: -1 })
      .limit(10)
      .lean();

    // Get top posts by engagement
    const topPosts = await Post.find({ status: 'published' })
      .populate('author', 'username displayName')
      .select('title likeCount commentCount viewCount')
      .sort({ likeCount: -1, commentCount: -1 })
      .limit(10)
      .lean();

    return {
      overview: {
        totalUsers,
        totalPosts,
        totalComments,
        timeframe
      },
      growth: {
        newUsers,
        newPosts,
        newComments,
        activeUsers
      },
      moderation: {
        reportedPosts,
        reportedComments,
        pendingReports: reportedPosts + reportedComments
      },
      topContent: {
        users: topUsers,
        posts: topPosts
      }
    };
  }

  /**
   * Get recent admin activity log
   * Returns recent admin actions for audit purposes
   * 
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Admin activity log
   */
  async getAdminActivityLog(pagination = {}) {
    const { page = 1, limit = 50 } = pagination;

    logger.info('Admin: Fetching activity log', { pagination });

    // This would typically come from a dedicated audit log collection
    // For now, we'll return a placeholder structure
    // TODO: Implement proper audit logging system

    return {
      activities: [], // Will be populated with actual audit log data
      pagination: {
        currentPage: page,
        totalPages: 1,
        totalItems: 0,
        itemsPerPage: limit,
        hasNextPage: false,
        hasPrevPage: false
      }
    };
  }

  /**
   * Get reported content summary
   * Returns summary of reported posts and comments
   * 
   * @returns {Promise<Object>} Reported content summary
   */
  async getReportedContent() {
    logger.info('Admin: Fetching reported content');

    const [reportedPosts, reportedComments] = await Promise.all([
      Post.find({ reportCount: { $gt: 0 } })
        .populate('author', 'username displayName')
        .select('title excerpt reportCount reports createdAt')
        .sort({ reportCount: -1 })
        .limit(20)
        .lean(),

      Comment.find({ reportCount: { $gt: 0 } })
        .populate('author', 'username displayName')
        .populate('post', 'title')
        .select('content reportCount reports createdAt')
        .sort({ reportCount: -1 })
        .limit(20)
        .lean()
    ]);

    return {
      posts: reportedPosts,
      comments: reportedComments,
      summary: {
        totalReportedPosts: reportedPosts.length,
        totalReportedComments: reportedComments.length,
        totalReports: reportedPosts.length + reportedComments.length
      }
    };
  }

  /**
   * Search users with admin privileges
   * Enhanced user search for admin purposes
   * 
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async searchUsers(query, options = {}) {
    const { limit = 20, includeInactive = false } = options;

    logger.info('Admin: Searching users', { query, options });

    const searchQuery = {
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { displayName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    };

    if (!includeInactive) {
      searchQuery.isActive = true;
    }

    const users = await User.find(searchQuery)
      .select('username displayName email role isActive isVerified createdAt')
      .limit(limit)
      .lean();

    return users;
  }
}

module.exports = new AdminService();
