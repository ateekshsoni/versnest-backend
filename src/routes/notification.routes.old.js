/**
 * @fileoverview Notification Routes - API endpoints for notification management
 * 
 * This file defines all notification-related routes with proper middleware for
 * authentication, rate limiting, and request validation.
 * 
 * Educational Notes:
 * - Notification endpoints are critical for user engagement
 * - Rate limiting prevents notification spam and abuse
 * - Real-time notifications can be enhanced with WebSocket/SSE
 * - Consider implementing notification preferences and filters
 */

const express = require('express');
const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/auth');
const { createRateLimiter } = require('../middlewares/rateLimit');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiter for notification endpoints
const notificationRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    message: 'Too many notification requests, please try again later',
    retryAfter: '15 minutes'
  }
});

// Stricter rate limit for write operations
const notificationWriteRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 write operations per 5 minutes
  message: {
    success: false,
    message: 'Too many notification update requests, please try again later',
    retryAfter: '5 minutes'
  }
});

// Middleware to log notification requests
const logNotificationRequest = (req, res, next) => {
  logger.info('Notification API request', {
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    query: req.query
  });
  next();
};

// Apply authentication to all notification routes
router.use(authenticate);

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications with pagination and filtering
 * @access  Private
 * @query   {number} page - Page number (default: 1)
 * @query   {number} limit - Items per page (default: 20, max: 50)
 * @query   {boolean} unreadOnly - Show only unread notifications
 * @query   {string|string[]} types - Filter by notification types
 */
router.get('/',
  notificationRateLimit,
  logNotificationRequest,
  notificationController.getNotifications
);

/**
 * @route   GET /api/notifications/stats
 * @desc    Get notification statistics for the user
 * @access  Private
 */
router.get('/stats',
  notificationRateLimit,
  logNotificationRequest,
  notificationController.getNotificationStats
);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count (lightweight for UI badges)
 * @access  Private
 */
router.get('/unread-count',
  notificationRateLimit,
  logNotificationRequest,
  notificationController.getUnreadCount
);

/**
 * @route   GET /api/notifications/types
 * @desc    Get available notification types and descriptions
 * @access  Private
 */
router.get('/types',
  notificationRateLimit,
  logNotificationRequest,
  notificationController.getNotificationTypes
);

/**
 * @route   PATCH /api/notifications/mark-read
 * @desc    Mark specific notification(s) as read
 * @access  Private
 * @body    {string|string[]} notificationIds - Notification ID(s) to mark as read
 */
router.patch('/mark-read',
  notificationWriteRateLimit,
  logNotificationRequest,
  notificationController.markAsRead
);

/**
 * @route   PATCH /api/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.patch('/mark-all-read',
  notificationWriteRateLimit,
  logNotificationRequest,
  notificationController.markAllAsRead
);

/**
 * @route   DELETE /api/notifications
 * @desc    Delete specific notification(s)
 * @access  Private
 * @body    {string|string[]} notificationIds - Notification ID(s) to delete
 */
router.delete('/',
  notificationWriteRateLimit,
  logNotificationRequest,
  notificationController.deleteNotifications
);

/**
 * @route   POST /api/notifications/test
 * @desc    Create a test notification (development/admin only)
 * @access  Private (Admin only in production)
 * @body    {string} type - Notification type
 * @body    {string} title - Notification title
 * @body    {string} message - Notification message
 * @body    {Object} metadata - Additional notification data
 */
router.post('/test',
  notificationWriteRateLimit,
  logNotificationRequest,
  notificationController.createTestNotification
);

// Error handling middleware specific to notification routes
router.use((error, req, res, next) => {
  logger.error('Notification route error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    ip: req.ip
  });
  
  // Pass to global error handler
  next(error);
});

// 404 handler for undefined notification routes
router.use('*', (req, res) => {
  logger.warn('Notification route not found', {
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    message: 'Notification endpoint not found',
    error: {
      code: 'ROUTE_NOT_FOUND',
      path: req.originalUrl,
      method: req.method
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
