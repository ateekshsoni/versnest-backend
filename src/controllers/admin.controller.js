/**
 * Admin Controller
 * 
 * This controller handles all admin-related HTTP requests and responses.
 * It provides administrative endpoints for user management, content moderation,
 * system analytics, and other privileged operations.
 * 
 * Endpoints:
 * - GET /api/admin/users - Get all users
 * - GET /api/admin/posts - Get all posts
 * - POST /api/admin/users/:userId/ban - Ban/unban user
 * - DELETE /api/admin/posts/:postId - Delete post
 * - POST /api/admin/posts/:postId/feature - Feature/unfeature post
 * - GET /api/admin/analytics - Get system analytics
 * - GET /api/admin/reports - Get reported content
 * - GET /api/admin/activity - Get admin activity log
 * - GET /api/admin/search/users - Search users
 * 
 * Security Notes:
 * - All endpoints require admin role
 * - Actions are logged for audit purposes
 * - Rate limiting applies to prevent abuse
 * - Sensitive operations have additional validation
 * 
 * Learning Notes:
 * - Admin controllers handle privileged operations
 * - Comprehensive validation and permission checks
 * - Detailed logging for accountability
 * - Structured response format for admin dashboards
 */

const adminService = require('../services/admin.service');
const { paginationSchema } = require('../validators/schemas');
const { ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');

class AdminController {
  /**
   * Get all users
   * GET /api/admin/users
   * 
   * Returns paginated list of all users with filtering options.
   * Admin-only endpoint for user management.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAllUsers(req, res, next) {
    try {
      const queryParams = req.query;
      const adminId = req.user.id;

      logger.info('Admin: Get all users request', { 
        adminId, 
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

      // Extract filters
      const filters = {
        role: queryParams.role,
        isActive: queryParams.isActive === 'true' ? true : 
                  queryParams.isActive === 'false' ? false : undefined,
        isVerified: queryParams.isVerified === 'true' ? true : 
                    queryParams.isVerified === 'false' ? false : undefined,
        search: queryParams.search,
        sortBy: queryParams.sortBy || 'createdAt',
        sortOrder: queryParams.sortOrder || 'desc'
      };

      const result = await adminService.getAllUsers(
        filters,
        paginationValidation.data
      );

      res.status(200).json({
        success: true,
        message: 'Users retrieved successfully',
        data: {
          users: result.users,
          pagination: result.pagination,
          filters: filters
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all posts
   * GET /api/admin/posts
   * 
   * Returns paginated list of all posts including drafts and private posts.
   * Admin-only endpoint for content management.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAllPosts(req, res, next) {
    try {
      const queryParams = req.query;
      const adminId = req.user.id;

      logger.info('Admin: Get all posts request', { 
        adminId, 
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

      // Extract filters
      const filters = {
        status: queryParams.status ? queryParams.status.split(',') : undefined,
        author: queryParams.author,
        reported: queryParams.reported === 'true',
        featured: queryParams.featured === 'true' ? true : 
                  queryParams.featured === 'false' ? false : undefined,
        search: queryParams.search,
        sortBy: queryParams.sortBy || 'createdAt',
        sortOrder: queryParams.sortOrder || 'desc'
      };

      const result = await adminService.getAllPosts(
        filters,
        paginationValidation.data
      );

      res.status(200).json({
        success: true,
        message: 'Posts retrieved successfully',
        data: {
          posts: result.posts,
          pagination: result.pagination,
          filters: filters
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Ban or unban user
   * POST /api/admin/users/:userId/ban
   * 
   * Bans or unbans a user account with reason logging.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async toggleUserBan(req, res, next) {
    try {
      const { userId } = req.params;
      const adminId = req.user.id;
      const { action, reason, duration } = req.body;

      logger.info('Admin: Toggle user ban request', { 
        userId, 
        adminId, 
        action, 
        reason 
      });

      // Validate required fields
      if (!action || !['ban', 'unban'].includes(action)) {
        throw new ValidationError('Action must be either "ban" or "unban"');
      }

      if (action === 'ban' && (!reason || reason.trim().length < 10)) {
        throw new ValidationError('Ban reason must be at least 10 characters long');
      }

      if (duration && (typeof duration !== 'number' || duration < 1)) {
        throw new ValidationError('Duration must be a positive number of days');
      }

      const result = await adminService.toggleUserBan(userId, adminId, {
        action,
        reason: reason?.trim(),
        duration
      });

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          action: result.action,
          userId
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete post
   * DELETE /api/admin/posts/:postId
   * 
   * Deletes a post as admin with reason logging.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deletePost(req, res, next) {
    try {
      const { postId } = req.params;
      const adminId = req.user.id;
      const { reason } = req.body;

      logger.info('Admin: Delete post request', { 
        postId, 
        adminId, 
        reason 
      });

      // Validate reason
      if (!reason || reason.trim().length < 10) {
        throw new ValidationError('Deletion reason must be at least 10 characters long');
      }

      const result = await adminService.deletePost(
        postId, 
        adminId, 
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
   * Toggle post featured status
   * POST /api/admin/posts/:postId/feature
   * 
   * Features or unfeatures a post.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async togglePostFeatured(req, res, next) {
    try {
      const { postId } = req.params;
      const adminId = req.user.id;
      const { featured } = req.body;

      logger.info('Admin: Toggle post featured request', { 
        postId, 
        adminId, 
        featured 
      });

      // Validate featured parameter
      if (typeof featured !== 'boolean') {
        throw new ValidationError('Featured must be a boolean value');
      }

      const result = await adminService.togglePostFeatured(
        postId, 
        adminId, 
        featured
      );

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          featured: result.featured
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get system analytics
   * GET /api/admin/analytics
   * 
   * Returns system-wide analytics and statistics.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getSystemAnalytics(req, res, next) {
    try {
      const { timeframe = '30d' } = req.query;
      const adminId = req.user.id;

      logger.info('Admin: Get system analytics request', { 
        adminId, 
        timeframe 
      });

      // Validate timeframe
      const validTimeframes = ['7d', '30d', '90d'];
      if (!validTimeframes.includes(timeframe)) {
        throw new ValidationError('Invalid timeframe. Must be one of: 7d, 30d, 90d');
      }

      const analytics = await adminService.getSystemAnalytics(timeframe);

      res.status(200).json({
        success: true,
        message: 'Analytics retrieved successfully',
        data: {
          analytics,
          timeframe,
          generatedAt: new Date()
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get reported content
   * GET /api/admin/reports
   * 
   * Returns reported posts and comments for moderation.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getReportedContent(req, res, next) {
    try {
      const adminId = req.user.id;

      logger.info('Admin: Get reported content request', { adminId });

      const reportedContent = await adminService.getReportedContent();

      res.status(200).json({
        success: true,
        message: 'Reported content retrieved successfully',
        data: {
          reportedContent
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get admin activity log
   * GET /api/admin/activity
   * 
   * Returns recent admin activity for audit purposes.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAdminActivity(req, res, next) {
    try {
      const queryParams = req.query;
      const adminId = req.user.id;

      logger.info('Admin: Get activity log request', { 
        adminId, 
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

      const activityLog = await adminService.getAdminActivityLog(
        paginationValidation.data
      );

      res.status(200).json({
        success: true,
        message: 'Admin activity log retrieved successfully',
        data: {
          activities: activityLog.activities,
          pagination: activityLog.pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search users
   * GET /api/admin/search/users
   * 
   * Enhanced user search for admin purposes.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async searchUsers(req, res, next) {
    try {
      const { q: query, limit = 20, includeInactive = false } = req.query;
      const adminId = req.user.id;

      logger.info('Admin: Search users request', { 
        adminId, 
        query, 
        limit, 
        includeInactive 
      });

      // Validate query
      if (!query || query.trim().length < 2) {
        throw new ValidationError('Search query must be at least 2 characters long');
      }

      // Validate limit
      const limitNum = parseInt(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        throw new ValidationError('Limit must be between 1 and 100');
      }

      const users = await adminService.searchUsers(query.trim(), {
        limit: limitNum,
        includeInactive: includeInactive === 'true'
      });

      res.status(200).json({
        success: true,
        message: 'User search completed successfully',
        data: {
          users,
          query: query.trim(),
          resultCount: users.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get dashboard summary
   * GET /api/admin/dashboard
   * 
   * Returns summary data for admin dashboard.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getDashboardSummary(req, res, next) {
    try {
      const adminId = req.user.id;

      logger.info('Admin: Get dashboard summary request', { adminId });

      // Get quick analytics and reported content summary
      const [analytics, reportedContent] = await Promise.all([
        adminService.getSystemAnalytics('7d'),
        adminService.getReportedContent()
      ]);

      const dashboardData = {
        quickStats: {
          totalUsers: analytics.overview.totalUsers,
          totalPosts: analytics.overview.totalPosts,
          totalComments: analytics.overview.totalComments,
          pendingReports: reportedContent.summary.totalReports
        },
        recentGrowth: {
          newUsers: analytics.growth.newUsers,
          newPosts: analytics.growth.newPosts,
          newComments: analytics.growth.newComments,
          activeUsers: analytics.growth.activeUsers
        },
        moderationQueue: {
          reportedPosts: reportedContent.summary.totalReportedPosts,
          reportedComments: reportedContent.summary.totalReportedComments
        },
        topContent: analytics.topContent
      };

      res.status(200).json({
        success: true,
        message: 'Dashboard summary retrieved successfully',
        data: {
          dashboard: dashboardData,
          lastUpdated: new Date()
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminController();
