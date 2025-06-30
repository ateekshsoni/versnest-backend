/**
 * User Controller
 * 
 * This controller handles all user-related HTTP requests and responses.
 * It follows the controller pattern by:
 * - Handling HTTP-specific concerns (request/response)
 * - Validating input using Zod schemas
 * - Delegating business logic to services
 * - Formatting responses consistently
 * - Managing error handling
 * 
 * Learning Notes:
 * - Controllers are the entry point for HTTP requests
 * - They should be thin and delegate to services
 * - Input validation happens here before service calls
 * - Response formatting is standardized
 * - Error handling is centralized via middleware
 */

const userService = require('../services/user.service');
const { 
  userUpdateSchema, 
  paginationSchema, 
  userSearchSchema 
} = require('../validators/schemas');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

class UserController {
  /**
   * Get user profile
   * GET /api/users/:userId
   * 
   * Returns user profile with privacy filtering and relationship status.
   * Includes user statistics and follows/followers information.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getUserProfile(req, res, next) {
    try {
      const { userId } = req.params;
      const requestingUserId = req.user?.id;

      logger.info('User profile request', { 
        userId, 
        requestingUserId,
        ip: req.ip 
      });

      const profile = await userService.getUserProfile(
        userId, 
        requestingUserId,
        {
          includeStats: true,
          includeRelationship: !!requestingUserId
        }
      );

      res.status(200).json({
        success: true,
        message: 'User profile retrieved successfully',
        data: {
          user: profile
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user's profile
   * GET /api/users/me
   * 
   * Returns the authenticated user's own profile with all private data.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getCurrentUserProfile(req, res, next) {
    try {
      const userId = req.user.id;

      logger.info('Current user profile request', { userId });

      const profile = await userService.getUserProfile(userId, userId, {
        includeStats: true,
        includePrivateData: true
      });

      res.status(200).json({
        success: true,
        message: 'Profile retrieved successfully',
        data: {
          user: profile
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user profile
   * PUT /api/users/me
   * 
   * Updates the authenticated user's profile information.
   * Validates input and applies security restrictions.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateUserProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const updateData = req.body;

      logger.info('User profile update request', { 
        userId, 
        fields: Object.keys(updateData) 
      });

      // Validate input data
      const validationResult = userUpdateSchema.safeParse(updateData);
      if (!validationResult.success) {
        throw new ValidationError(
          'Invalid update data',
          validationResult.error.issues
        );
      }

      const updatedProfile = await userService.updateUserProfile(
        userId,
        validationResult.data,
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: updatedProfile
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search users
   * GET /api/users/search
   * 
   * Searches users with pagination, filtering, and sorting options.
   * Supports text search across username, display name, and bio.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async searchUsers(req, res, next) {
    try {
      const queryParams = req.query;

      logger.info('User search request', { 
        query: queryParams,
        userId: req.user?.id 
      });

      // Validate search parameters
      const searchValidation = userSearchSchema.safeParse(queryParams);
      if (!searchValidation.success) {
        throw new ValidationError(
          'Invalid search parameters',
          searchValidation.error.issues
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

      const searchResult = await userService.searchUsers(
        searchValidation.data,
        paginationValidation.data
      );

      res.status(200).json({
        success: true,
        message: 'Users retrieved successfully',
        data: {
          users: searchResult.users,
          pagination: searchResult.pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Follow user
   * POST /api/users/:userId/follow
   * 
   * Creates a following relationship between authenticated user and target user.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async followUser(req, res, next) {
    try {
      const { userId: followeeId } = req.params;
      const followerId = req.user.id;

      logger.info('Follow user request', { followerId, followeeId });

      const result = await userService.followUser(followerId, followeeId);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          isFollowing: result.isFollowing
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unfollow user
   * DELETE /api/users/:userId/follow
   * 
   * Removes following relationship between authenticated user and target user.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async unfollowUser(req, res, next) {
    try {
      const { userId: followeeId } = req.params;
      const followerId = req.user.id;

      logger.info('Unfollow user request', { followerId, followeeId });

      const result = await userService.unfollowUser(followerId, followeeId);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          isFollowing: result.isFollowing
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user followers
   * GET /api/users/:userId/followers
   * 
   * Returns list of users following the specified user with pagination.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getUserFollowers(req, res, next) {
    try {
      const { userId } = req.params;
      const queryParams = req.query;

      logger.info('Get user followers request', { userId, query: queryParams });

      // Validate pagination parameters
      const paginationValidation = paginationSchema.safeParse(queryParams);
      if (!paginationValidation.success) {
        throw new ValidationError(
          'Invalid pagination parameters',
          paginationValidation.error.issues
        );
      }

      const result = await userService.getUserFollowers(
        userId,
        paginationValidation.data
      );

      res.status(200).json({
        success: true,
        message: 'Followers retrieved successfully',
        data: {
          followers: result.followers,
          pagination: result.pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user following
   * GET /api/users/:userId/following
   * 
   * Returns list of users that the specified user is following with pagination.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getUserFollowing(req, res, next) {
    try {
      const { userId } = req.params;
      const queryParams = req.query;

      logger.info('Get user following request', { userId, query: queryParams });

      // Validate pagination parameters
      const paginationValidation = paginationSchema.safeParse(queryParams);
      if (!paginationValidation.success) {
        throw new ValidationError(
          'Invalid pagination parameters',
          paginationValidation.error.issues
        );
      }

      const result = await userService.getUserFollowing(
        userId,
        paginationValidation.data
      );

      res.status(200).json({
        success: true,
        message: 'Following list retrieved successfully',
        data: {
          following: result.following,
          pagination: result.pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete user account
   * DELETE /api/users/me
   * 
   * Deletes the authenticated user's account.
   * This is a soft delete that deactivates the account.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteCurrentUser(req, res, next) {
    try {
      const userId = req.user.id;

      logger.info('Delete user account request', { userId });

      const result = await userService.deleteUser(userId, userId, false);

      // Clear authentication cookies
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Delete user account
   * DELETE /api/admin/users/:userId
   * 
   * Allows admins to delete any user account.
   * This is a soft delete that deactivates the account.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async adminDeleteUser(req, res, next) {
    try {
      const { userId } = req.params;
      const requestingUserId = req.user.id;

      logger.info('Admin delete user request', { 
        userId, 
        requestingUserId,
        adminRole: req.user.role 
      });

      const result = await userService.deleteUser(
        userId, 
        requestingUserId, 
        true
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
   * Get user activity summary
   * GET /api/users/:userId/activity
   * 
   * Returns user's recent activity summary including posts, comments, and interactions.
   * Privacy-filtered based on user settings and relationship.
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getUserActivity(req, res, next) {
    try {
      const { userId } = req.params;
      const requestingUserId = req.user?.id;

      logger.info('Get user activity request', { userId, requestingUserId });

      // For now, return basic activity data
      // TODO: Implement activity service
      const activity = {
        recentPosts: [], // Will be populated by post service
        recentComments: [], // Will be populated by comment service
        recentInteractions: [], // Likes, shares, etc.
        lastActive: new Date() // From user model
      };

      res.status(200).json({
        success: true,
        message: 'User activity retrieved successfully',
        data: {
          activity
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();
