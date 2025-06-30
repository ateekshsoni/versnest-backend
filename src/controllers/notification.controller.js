/**
 * @fileoverview Notification Controller - HTTP handlers for notification-related endpoints
 * 
 * This controller handles all notification-related HTTP requests, providing endpoints
 * for retrieving, managing, and interacting with user notifications.
 * 
 * Educational Notes:
 * - Controllers handle HTTP-specific concerns (request/response formatting)
 * - Business logic is delegated to services
 * - Input validation is handled by middleware
 * - Proper error handling ensures consistent API responses
 */

const notificationService = require('../services/notification.service');
const logger = require('../utils/logger');
const { AppError } = require('../middlewares/error.middleware');

class NotificationController {
  /**
   * Get user's notifications with pagination and filtering
   * 
   * @route GET /api/notifications
   * @access Private
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getNotifications(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        page = 1,
        limit = 20,
        unreadOnly = false,
        types = []
      } = req.query;

      // Parse query parameters
      const options = {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 50), // Max 50 items per page
        unreadOnly: unreadOnly === 'true',
        types: Array.isArray(types) ? types : (types ? [types] : [])
      };

      const result = await notificationService.getUserNotifications(userId, options);

      res.status(200).json({
        success: true,
        message: 'Notifications retrieved successfully',
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in getNotifications controller:', error);
      next(error);
    }
  }

  /**
   * Get notification statistics for the user
   * 
   * @route GET /api/notifications/stats
   * @access Private
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getNotificationStats(req, res, next) {
    try {
      const userId = req.user.id;
      const stats = await notificationService.getNotificationStats(userId);

      res.status(200).json({
        success: true,
        message: 'Notification statistics retrieved successfully',
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in getNotificationStats controller:', error);
      next(error);
    }
  }

  /**
   * Mark specific notification(s) as read
   * 
   * @route PATCH /api/notifications/mark-read
   * @access Private
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async markAsRead(req, res, next) {
    try {
      const userId = req.user.id;
      const { notificationIds } = req.body;

      if (!notificationIds || (!Array.isArray(notificationIds) && typeof notificationIds !== 'string')) {
        throw new AppError('Notification IDs are required', 400);
      }

      const result = await notificationService.markAsRead(userId, notificationIds);

      res.status(200).json({
        success: true,
        message: 'Notifications marked as read successfully',
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in markAsRead controller:', error);
      next(error);
    }
  }

  /**
   * Mark all notifications as read
   * 
   * @route PATCH /api/notifications/mark-all-read
   * @access Private
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async markAllAsRead(req, res, next) {
    try {
      const userId = req.user.id;
      const result = await notificationService.markAllAsRead(userId);

      res.status(200).json({
        success: true,
        message: 'All notifications marked as read successfully',
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in markAllAsRead controller:', error);
      next(error);
    }
  }

  /**
   * Delete specific notification(s)
   * 
   * @route DELETE /api/notifications
   * @access Private
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteNotifications(req, res, next) {
    try {
      const userId = req.user.id;
      const { notificationIds } = req.body;

      if (!notificationIds || (!Array.isArray(notificationIds) && typeof notificationIds !== 'string')) {
        throw new AppError('Notification IDs are required', 400);
      }

      const result = await notificationService.deleteNotifications(userId, notificationIds);

      res.status(200).json({
        success: true,
        message: 'Notifications deleted successfully',
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in deleteNotifications controller:', error);
      next(error);
    }
  }

  /**
   * Get unread notification count (lightweight endpoint for UI badges)
   * 
   * @route GET /api/notifications/unread-count
   * @access Private
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getUnreadCount(req, res, next) {
    try {
      const userId = req.user.id;
      const User = require('../models/user.model');
      
      const user = await User.findById(userId).select('unreadNotificationCount');
      if (!user) {
        throw new AppError('User not found', 404);
      }

      res.status(200).json({
        success: true,
        data: {
          unreadCount: user.unreadNotificationCount || 0
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in getUnreadCount controller:', error);
      next(error);
    }
  }

  /**
   * Test notification creation (for development/testing)
   * 
   * @route POST /api/notifications/test
   * @access Private (Admin only in production)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async createTestNotification(req, res, next) {
    try {
      // Only allow in development or for admin users
      if (process.env.NODE_ENV === 'production' && req.user.role !== 'admin') {
        throw new AppError('Access denied', 403);
      }

      const userId = req.user.id;
      const {
        type = 'system',
        title = 'Test Notification',
        message = 'This is a test notification',
        metadata = {}
      } = req.body;

      const notification = await notificationService.createNotification({
        recipientId: userId,
        type,
        title,
        message,
        metadata
      });

      res.status(201).json({
        success: true,
        message: 'Test notification created successfully',
        data: notification,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in createTestNotification controller:', error);
      next(error);
    }
  }

  /**
   * Get notification types available in the system
   * 
   * @route GET /api/notifications/types
   * @access Private
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getNotificationTypes(req, res, next) {
    try {
      const { NOTIFICATION_TYPES } = require('../services/notification.service');
      
      res.status(200).json({
        success: true,
        message: 'Notification types retrieved successfully',
        data: {
          types: Object.values(NOTIFICATION_TYPES),
          descriptions: {
            [NOTIFICATION_TYPES.FOLLOW]: 'Someone followed you',
            [NOTIFICATION_TYPES.LIKE_POST]: 'Someone liked your post',
            [NOTIFICATION_TYPES.LIKE_COMMENT]: 'Someone liked your comment',
            [NOTIFICATION_TYPES.COMMENT]: 'Someone commented on your post',
            [NOTIFICATION_TYPES.REPLY]: 'Someone replied to your comment',
            [NOTIFICATION_TYPES.MENTION]: 'Someone mentioned you',
            [NOTIFICATION_TYPES.POST_PUBLISHED]: 'A followed author published a new post',
            [NOTIFICATION_TYPES.ACHIEVEMENT]: 'You earned an achievement',
            [NOTIFICATION_TYPES.SYSTEM]: 'System notification'
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in getNotificationTypes controller:', error);
      next(error);
    }
  }
}

module.exports = new NotificationController();
