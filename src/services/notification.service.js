/**
 * @fileoverview Notification Service - Handles user notifications for various platform activities
 * 
 * This service manages the creation, retrieval, and management of notifications for users.
 * It supports different notification types like follows, likes, comments, mentions, etc.
 * 
 * Educational Notes:
 * - Notifications are critical for user engagement in social platforms
 * - Batch processing can optimize database operations for high-volume notifications
 * - Real-time notifications can be enhanced with WebSocket integration
 * - Consider implementing notification preferences and channels (email, push, in-app)
 */

const mongoose = require('mongoose');
const User = require('../models/user.model');
const logger = require('../utils/logger');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Notification Types - Defines all possible notification types in the system
 * This enum-like object helps maintain consistency and prevents typos
 */
const NOTIFICATION_TYPES = {
  FOLLOW: 'follow',
  LIKE_POST: 'like_post',
  LIKE_COMMENT: 'like_comment',
  COMMENT: 'comment',
  REPLY: 'reply',
  MENTION: 'mention',
  POST_PUBLISHED: 'post_published',
  ACHIEVEMENT: 'achievement',
  SYSTEM: 'system'
};

class NotificationService {
  /**
   * Create a new notification for a user
   * 
   * @param {Object} notificationData - The notification data
   * @param {string} notificationData.recipientId - The user receiving the notification
   * @param {string} notificationData.type - Type of notification (from NOTIFICATION_TYPES)
   * @param {string} notificationData.title - Notification title
   * @param {string} notificationData.message - Notification message
   * @param {string} [notificationData.senderId] - The user who triggered the notification
   * @param {string} [notificationData.relatedId] - ID of related resource (post, comment, etc.)
   * @param {string} [notificationData.relatedType] - Type of related resource
   * @param {Object} [notificationData.metadata] - Additional notification data
   * @returns {Promise<Object>} Created notification
   */
  async createNotification(notificationData) {
    try {
      const {
        recipientId,
        type,
        title,
        message,
        senderId,
        relatedId,
        relatedType,
        metadata = {}
      } = notificationData;

      // Validate notification type
      if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
        throw new AppError('Invalid notification type', 400);
      }

      // Don't create notification if sender and recipient are the same
      if (senderId && senderId.toString() === recipientId.toString()) {
        return null;
      }

      // Check if recipient exists
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        throw new AppError('Recipient not found', 404);
      }

      // Create notification object
      const notification = {
        _id: new mongoose.Types.ObjectId(),
        type,
        title,
        message,
        recipient: recipientId,
        sender: senderId || null,
        relatedId: relatedId || null,
        relatedType: relatedType || null,
        isRead: false,
        metadata,
        createdAt: new Date()
      };

      // Add notification to user's notifications array
      // Using $push with $slice to maintain a maximum number of notifications
      const MAX_NOTIFICATIONS = 100;
      await User.findByIdAndUpdate(
        recipientId,
        {
          $push: {
            notifications: {
              $each: [notification],
              $slice: -MAX_NOTIFICATIONS // Keep only the last 100 notifications
            }
          },
          $inc: { unreadNotificationCount: 1 }
        },
        { new: true }
      );

      logger.info(`Notification created for user ${recipientId}`, {
        notificationType: type,
        senderId,
        relatedId
      });

      return notification;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Create multiple notifications efficiently (batch operation)
   * Useful for scenarios like broadcasting notifications to followers
   * 
   * @param {Array<Object>} notificationsData - Array of notification data objects
   * @returns {Promise<Array<Object>>} Array of created notifications
   */
  async createBulkNotifications(notificationsData) {
    try {
      const validNotifications = notificationsData.filter(data => {
        // Filter out invalid notifications and self-notifications
        return data.recipientId && 
               data.senderId !== data.recipientId &&
               Object.values(NOTIFICATION_TYPES).includes(data.type);
      });

      const bulkOps = validNotifications.map(data => ({
        updateOne: {
          filter: { _id: data.recipientId },
          update: {
            $push: {
              notifications: {
                $each: [{
                  _id: new mongoose.Types.ObjectId(),
                  type: data.type,
                  title: data.title,
                  message: data.message,
                  recipient: data.recipientId,
                  sender: data.senderId || null,
                  relatedId: data.relatedId || null,
                  relatedType: data.relatedType || null,
                  isRead: false,
                  metadata: data.metadata || {},
                  createdAt: new Date()
                }],
                $slice: -100
              }
            },
            $inc: { unreadNotificationCount: 1 }
          }
        }
      }));

      if (bulkOps.length > 0) {
        await User.bulkWrite(bulkOps);
        logger.info(`Bulk created ${bulkOps.length} notifications`);
      }

      return validNotifications;
    } catch (error) {
      logger.error('Error creating bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Get user's notifications with pagination and filtering
   * 
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=20] - Items per page
   * @param {boolean} [options.unreadOnly=false] - Show only unread notifications
   * @param {Array<string>} [options.types] - Filter by notification types
   * @returns {Promise<Object>} Paginated notifications
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        unreadOnly = false,
        types = []
      } = options;

      const user = await User.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      let notifications = user.notifications || [];

      // Apply filters
      if (unreadOnly) {
        notifications = notifications.filter(n => !n.isRead);
      }

      if (types.length > 0) {
        notifications = notifications.filter(n => types.includes(n.type));
      }

      // Sort by creation date (newest first)
      notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedNotifications = notifications.slice(startIndex, endIndex);

      // Populate sender information for notifications that have it
      const populatedNotifications = await Promise.all(
        paginatedNotifications.map(async (notification) => {
          if (notification.sender) {
            const sender = await User.findById(notification.sender)
              .select('username fullName profilePicture');
            return {
              ...notification.toObject(),
              senderInfo: sender
            };
          }
          return notification;
        })
      );

      return {
        notifications: populatedNotifications,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(notifications.length / limit),
          totalNotifications: notifications.length,
          hasNextPage: endIndex < notifications.length,
          hasPrevPage: page > 1
        },
        unreadCount: user.unreadNotificationCount || 0
      };
    } catch (error) {
      logger.error('Error fetching user notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification(s) as read
   * 
   * @param {string} userId - User ID
   * @param {string|Array<string>} notificationIds - Notification ID(s) to mark as read
   * @returns {Promise<Object>} Update result
   */
  async markAsRead(userId, notificationIds) {
    try {
      const idsArray = Array.isArray(notificationIds) ? notificationIds : [notificationIds];
      
      const user = await User.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      let unreadCountDecrease = 0;
      
      // Update notifications in the array
      user.notifications.forEach(notification => {
        if (idsArray.includes(notification._id.toString()) && !notification.isRead) {
          notification.isRead = true;
          notification.readAt = new Date();
          unreadCountDecrease++;
        }
      });

      // Update unread count
      user.unreadNotificationCount = Math.max(0, 
        (user.unreadNotificationCount || 0) - unreadCountDecrease
      );

      await user.save();

      logger.info(`Marked ${unreadCountDecrease} notifications as read for user ${userId}`);

      return {
        success: true,
        markedCount: unreadCountDecrease,
        remainingUnreadCount: user.unreadNotificationCount
      };
    } catch (error) {
      logger.error('Error marking notifications as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   * 
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Update result
   */
  async markAllAsRead(userId) {
    try {
      const result = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            'notifications.$[].isRead': true,
            'notifications.$[].readAt': new Date(),
            unreadNotificationCount: 0
          }
        },
        { new: true }
      );

      if (!result) {
        throw new AppError('User not found', 404);
      }

      logger.info(`Marked all notifications as read for user ${userId}`);

      return {
        success: true,
        message: 'All notifications marked as read'
      };
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Delete notification(s)
   * 
   * @param {string} userId - User ID
   * @param {string|Array<string>} notificationIds - Notification ID(s) to delete
   * @returns {Promise<Object>} Delete result
   */
  async deleteNotifications(userId, notificationIds) {
    try {
      const idsArray = Array.isArray(notificationIds) ? notificationIds : [notificationIds];
      
      const result = await User.findByIdAndUpdate(
        userId,
        {
          $pull: {
            notifications: {
              _id: { $in: idsArray.map(id => new mongoose.Types.ObjectId(id)) }
            }
          }
        },
        { new: true }
      );

      if (!result) {
        throw new AppError('User not found', 404);
      }

      // Recalculate unread count
      const unreadCount = result.notifications.filter(n => !n.isRead).length;
      await User.findByIdAndUpdate(userId, { unreadNotificationCount: unreadCount });

      logger.info(`Deleted ${idsArray.length} notifications for user ${userId}`);

      return {
        success: true,
        deletedCount: idsArray.length
      };
    } catch (error) {
      logger.error('Error deleting notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics for a user
   * 
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Notification statistics
   */
  async getNotificationStats(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      const notifications = user.notifications || [];
      
      // Calculate statistics
      const stats = {
        total: notifications.length,
        unread: notifications.filter(n => !n.isRead).length,
        read: notifications.filter(n => n.isRead).length,
        byType: {},
        recent: notifications
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 5)
      };

      // Group by type
      notifications.forEach(notification => {
        stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      logger.error('Error fetching notification statistics:', error);
      throw error;
    }
  }

  /**
   * Helper method to create follow notification
   * 
   * @param {string} followerId - User who followed
   * @param {string} followedId - User who was followed
   * @returns {Promise<Object>} Created notification
   */
  async createFollowNotification(followerId, followedId) {
    const follower = await User.findById(followerId).select('username fullName');
    
    return this.createNotification({
      recipientId: followedId,
      type: NOTIFICATION_TYPES.FOLLOW,
      title: 'New Follower',
      message: `${follower.fullName || follower.username} started following you`,
      senderId: followerId,
      relatedId: followerId,
      relatedType: 'user'
    });
  }

  /**
   * Helper method to create post like notification
   * 
   * @param {string} likerId - User who liked
   * @param {string} postAuthorId - Post author
   * @param {string} postId - Post ID
   * @param {string} postTitle - Post title
   * @returns {Promise<Object>} Created notification
   */
  async createPostLikeNotification(likerId, postAuthorId, postId, postTitle) {
    const liker = await User.findById(likerId).select('username fullName');
    
    return this.createNotification({
      recipientId: postAuthorId,
      type: NOTIFICATION_TYPES.LIKE_POST,
      title: 'Post Liked',
      message: `${liker.fullName || liker.username} liked your post "${postTitle}"`,
      senderId: likerId,
      relatedId: postId,
      relatedType: 'post'
    });
  }

  /**
   * Helper method to create comment notification
   * 
   * @param {string} commenterId - User who commented
   * @param {string} postAuthorId - Post author
   * @param {string} postId - Post ID
   * @param {string} postTitle - Post title
   * @returns {Promise<Object>} Created notification
   */
  async createCommentNotification(commenterId, postAuthorId, postId, postTitle) {
    const commenter = await User.findById(commenterId).select('username fullName');
    
    return this.createNotification({
      recipientId: postAuthorId,
      type: NOTIFICATION_TYPES.COMMENT,
      title: 'New Comment',
      message: `${commenter.fullName || commenter.username} commented on your post "${postTitle}"`,
      senderId: commenterId,
      relatedId: postId,
      relatedType: 'post'
    });
  }
}

// Export singleton instance
module.exports = new NotificationService();
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
