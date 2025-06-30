/**
 * User Service
 * 
 * This service handles all user-related business logic operations.
 * It implements the service layer pattern, separating business logic
 * from controllers and providing reusable functions.
 * 
 * Features:
 * - User profile management (get, update, delete)
 * - User search and filtering with pagination
 * - Follow/unfollow system
 * - User statistics and analytics
 * - Privacy and security controls
 * - Role-based operations
 * 
 * Learning Notes:
 * - Services contain business logic, not HTTP concerns
 * - They can be reused across different controllers
 * - Database operations are abstracted here
 * - Error handling uses custom error classes
 */

const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');

class UserService {
  /**
   * Get user profile by ID
   * Includes privacy filtering and relationship status
   * 
   * @param {string} userId - The user ID to fetch
   * @param {string} requestingUserId - ID of user making the request
   * @param {Object} options - Query options
   * @returns {Promise<Object>} User profile data
   */
  async getUserProfile(userId, requestingUserId = null, options = {}) {
    logger.info('Fetching user profile', { userId, requestingUserId });

    // Find user with selected fields based on privacy
    const user = await User.findById(userId)
      .select(this._getProfileFields(requestingUserId === userId))
      .populate('followers', 'username displayName avatar')
      .populate('following', 'username displayName avatar')
      .lean();

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if profiles are mutually following (for privacy)
    const isFollowing = requestingUserId && user.followers.some(
      follower => follower._id.toString() === requestingUserId
    );

    // Apply privacy filters
    const profile = this._applyPrivacyFilters(user, requestingUserId === userId, isFollowing);

    // Add user statistics
    profile.stats = await this._getUserStats(userId);

    // Add relationship status if requesting user exists
    if (requestingUserId && requestingUserId !== userId) {
      profile.relationshipStatus = {
        isFollowing: user.followers.some(f => f._id.toString() === requestingUserId),
        isFollowedBy: user.following.some(f => f._id.toString() === requestingUserId),
        canMessage: this._canMessage(user, requestingUserId, isFollowing)
      };
    }

    return profile;
  }

  /**
   * Update user profile
   * Handles profile updates with validation and security checks
   * 
   * @param {string} userId - User ID to update
   * @param {Object} updateData - Data to update
   * @param {string} requestingUserId - ID of user making request
   * @returns {Promise<Object>} Updated user profile
   */
  async updateUserProfile(userId, updateData, requestingUserId) {
    logger.info('Updating user profile', { userId, requestingUserId });

    // Authorization check
    if (userId !== requestingUserId) {
      throw new ForbiddenError('You can only update your own profile');
    }

    // Remove sensitive fields that shouldn't be updated via this method
    const allowedFields = [
      'displayName', 'bio', 'location', 'website', 'avatar',
      'coverImage', 'socialLinks', 'preferences', 'privacy'
    ];

    const sanitizedData = {};
    allowedFields.forEach(field => {
      if (updateData.hasOwnProperty(field)) {
        sanitizedData[field] = updateData[field];
      }
    });

    // Special handling for nested objects
    if (updateData.socialLinks) {
      sanitizedData.socialLinks = {
        ...updateData.socialLinks
      };
    }

    if (updateData.preferences) {
      sanitizedData.preferences = {
        ...updateData.preferences
      };
    }

    if (updateData.privacy) {
      sanitizedData.privacy = {
        ...updateData.privacy
      };
    }

    // Update timestamp
    sanitizedData.updatedAt = new Date();

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: sanitizedData },
      { new: true, runValidators: true }
    ).select(this._getProfileFields(true));

    if (!user) {
      throw new NotFoundError('User not found');
    }

    logger.info('User profile updated successfully', { userId });
    return user;
  }

  /**
   * Search users with pagination and filtering
   * Supports text search, role filtering, and sorting
   * 
   * @param {Object} query - Search parameters
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Search results with metadata
   */
  async searchUsers(query = {}, pagination = {}) {
    const {
      search = '',
      role,
      isVerified,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = query;

    const {
      page = 1,
      limit = 20,
      offset = 0
    } = pagination;

    logger.info('Searching users', { query, pagination });

    // Build search filter
    const filter = {};

    // Text search across multiple fields
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } },
        { bio: { $regex: search, $options: 'i' } }
      ];
    }

    // Role filter
    if (role) {
      filter.role = role;
    }

    // Verification filter
    if (typeof isVerified === 'boolean') {
      filter.isVerified = isVerified;
    }

    // Only active users
    filter.isActive = true;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute search with pagination
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('username displayName bio avatar isVerified role followerCount createdAt')
        .sort(sort)
        .skip(offset || (page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
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
   * Follow a user
   * Implements mutual following relationship with notifications
   * 
   * @param {string} followerId - ID of user doing the following
   * @param {string} followeeId - ID of user being followed
   * @returns {Promise<Object>} Follow operation result
   */
  async followUser(followerId, followeeId) {
    logger.info('Following user', { followerId, followeeId });

    if (followerId === followeeId) {
      throw new ValidationError('You cannot follow yourself');
    }

    const [follower, followee] = await Promise.all([
      User.findById(followerId),
      User.findById(followeeId)
    ]);

    if (!followee) {
      throw new NotFoundError('User to follow not found');
    }

    if (!follower) {
      throw new NotFoundError('Follower user not found');
    }

    // Check if already following
    const isAlreadyFollowing = follower.following.includes(followeeId);
    if (isAlreadyFollowing) {
      throw new ValidationError('Already following this user');
    }

    // Check privacy settings
    if (followee.privacy.profileVisibility === 'private') {
      // For now, we'll allow following but they might need approval
      // This could be extended to implement follow requests
      logger.info('Following private account', { followerId, followeeId });
    }

    // Update both users atomically
    await Promise.all([
      User.findByIdAndUpdate(followerId, {
        $push: { following: followeeId },
        $inc: { followingCount: 1 }
      }),
      User.findByIdAndUpdate(followeeId, {
        $push: { followers: followerId },
        $inc: { followerCount: 1 }
      })
    ]);

    logger.info('User followed successfully', { followerId, followeeId });

    // TODO: Create notification for followee
    // await this.notificationService.createFollowNotification(followerId, followeeId);

    return {
      success: true,
      message: 'User followed successfully',
      isFollowing: true
    };
  }

  /**
   * Unfollow a user
   * Removes mutual following relationship
   * 
   * @param {string} followerId - ID of user doing the unfollowing
   * @param {string} followeeId - ID of user being unfollowed
   * @returns {Promise<Object>} Unfollow operation result
   */
  async unfollowUser(followerId, followeeId) {
    logger.info('Unfollowing user', { followerId, followeeId });

    if (followerId === followeeId) {
      throw new ValidationError('You cannot unfollow yourself');
    }

    const follower = await User.findById(followerId);
    if (!follower) {
      throw new NotFoundError('Follower user not found');
    }

    // Check if currently following
    const isFollowing = follower.following.includes(followeeId);
    if (!isFollowing) {
      throw new ValidationError('Not currently following this user');
    }

    // Update both users atomically
    await Promise.all([
      User.findByIdAndUpdate(followerId, {
        $pull: { following: followeeId },
        $inc: { followingCount: -1 }
      }),
      User.findByIdAndUpdate(followeeId, {
        $pull: { followers: followerId },
        $inc: { followerCount: -1 }
      })
    ]);

    logger.info('User unfollowed successfully', { followerId, followeeId });

    return {
      success: true,
      message: 'User unfollowed successfully',
      isFollowing: false
    };
  }

  /**
   * Get user's followers with pagination
   * 
   * @param {string} userId - User ID
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Followers list with metadata
   */
  async getUserFollowers(userId, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const user = await User.findById(userId)
      .populate({
        path: 'followers',
        select: 'username displayName avatar bio isVerified',
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

    const totalFollowers = await User.findById(userId).select('followerCount');
    const total = totalFollowers.followerCount;
    const totalPages = Math.ceil(total / limit);

    return {
      followers: user.followers,
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
   * Get user's following list with pagination
   * 
   * @param {string} userId - User ID
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Following list with metadata
   */
  async getUserFollowing(userId, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const user = await User.findById(userId)
      .populate({
        path: 'following',
        select: 'username displayName avatar bio isVerified',
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

    const totalFollowing = await User.findById(userId).select('followingCount');
    const total = totalFollowing.followingCount;
    const totalPages = Math.ceil(total / limit);

    return {
      following: user.following,
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
   * Delete user account
   * Handles account deletion with data cleanup
   * 
   * @param {string} userId - User ID to delete
   * @param {string} requestingUserId - ID of user making request
   * @param {boolean} isAdmin - Whether requester is admin
   * @returns {Promise<Object>} Deletion result
   */
  async deleteUser(userId, requestingUserId, isAdmin = false) {
    logger.info('Deleting user account', { userId, requestingUserId, isAdmin });

    // Authorization check
    if (!isAdmin && userId !== requestingUserId) {
      throw new ForbiddenError('You can only delete your own account');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Prevent admin self-deletion
    if (user.role === 'admin' && userId === requestingUserId) {
      throw new ForbiddenError('Admins cannot delete their own accounts');
    }

    // TODO: Implement data cleanup
    // - Transfer or delete posts
    // - Handle comments
    // - Clean up relationships
    // - Cancel subscriptions
    // - Clear tokens

    // For now, just mark as inactive
    await User.findByIdAndUpdate(userId, {
      isActive: false,
      deactivatedAt: new Date(),
      // Clear sensitive data
      email: `deleted_${userId}@deleted.local`,
      username: `deleted_${userId}`,
      // Keep display name for post attribution
    });

    logger.info('User account deleted successfully', { userId });

    return {
      success: true,
      message: 'Account deleted successfully'
    };
  }

  /**
   * Get user statistics
   * Private method to calculate user stats
   * 
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User statistics
   */
  async _getUserStats(userId) {
    const [postCount, commentCount] = await Promise.all([
      Post.countDocuments({ author: userId, status: 'published' }),
      Comment.countDocuments({ author: userId })
    ]);

    return {
      postsCount: postCount,
      commentsCount: commentCount
    };
  }

  /**
   * Get profile fields based on access level
   * Private method to determine which fields to return
   * 
   * @param {boolean} isOwnProfile - Whether viewing own profile
   * @returns {string} Field selection string
   */
  _getProfileFields(isOwnProfile) {
    const publicFields = 'username displayName bio avatar coverImage isVerified role followerCount followingCount createdAt socialLinks';
    const privateFields = ' email preferences privacy lastActive';

    return isOwnProfile ? publicFields + privateFields : publicFields;
  }

  /**
   * Apply privacy filters to user profile
   * Private method to filter profile based on privacy settings
   * 
   * @param {Object} user - User object
   * @param {boolean} isOwnProfile - Whether viewing own profile
   * @param {boolean} isFollowing - Whether requester follows this user
   * @returns {Object} Filtered user profile
   */
  _applyPrivacyFilters(user, isOwnProfile, isFollowing) {
    if (isOwnProfile) {
      return user; // Return all data for own profile
    }

    const filtered = { ...user };

    // Apply email privacy
    if (user.privacy?.showEmail === false) {
      delete filtered.email;
    }

    // Apply activity privacy
    if (user.privacy?.showLastActive === false) {
      delete filtered.lastActive;
    }

    // Apply follower/following privacy
    if (user.privacy?.showFollowers === false && !isFollowing) {
      filtered.followers = [];
      filtered.followerCount = 0;
    }

    if (user.privacy?.showFollowing === false && !isFollowing) {
      filtered.following = [];
      filtered.followingCount = 0;
    }

    return filtered;
  }

  /**
   * Check if user can message another user
   * Private method to determine messaging permissions
   * 
   * @param {Object} user - Target user
   * @param {string} requestingUserId - Requesting user ID
   * @param {boolean} isFollowing - Whether users follow each other
   * @returns {boolean} Whether messaging is allowed
   */
  _canMessage(user, requestingUserId, isFollowing) {
    const messagePrivacy = user.privacy?.allowMessagesFrom || 'followers';

    switch (messagePrivacy) {
      case 'everyone':
        return true;
      case 'followers':
        return isFollowing;
      case 'none':
        return false;
      default:
        return isFollowing;
    }
  }
}

module.exports = new UserService();
