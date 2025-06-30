/**
 * Admin Routes
 * 
 * This file defines all admin-related API endpoints with strict security measures.
 * These routes are only accessible to users with admin role and implement
 * comprehensive logging, rate limiting, and validation.
 * 
 * Routes Structure:
 * - GET /api/admin/dashboard - Admin dashboard summary
 * - GET /api/admin/users - Get all users
 * - POST /api/admin/users/:userId/ban - Ban/unban user
 * - GET /api/admin/posts - Get all posts
 * - DELETE /api/admin/posts/:postId - Delete post
 * - POST /api/admin/posts/:postId/feature - Feature/unfeature post
 * - GET /api/admin/analytics - System analytics
 * - GET /api/admin/reports - Reported content
 * - GET /api/admin/activity - Admin activity log
 * - GET /api/admin/search/users - Search users
 * 
 * Security Features:
 * - Strict admin role requirement
 * - Enhanced rate limiting for admin operations
 * - Comprehensive audit logging
 * - Input validation and sanitization
 * - Action confirmation for destructive operations
 * 
 * Learning Notes:
 * - Admin routes require the highest security level
 * - All admin actions should be logged for audit
 * - Rate limiting prevents admin abuse
 * - Clear separation between admin and user operations
 */

const express = require('express');
const adminController = require('../controllers/admin.controller');
const { authenticate, requireRole } = require('../middlewares/auth');
const { 
  createRateLimiter, 
  createStrictRateLimiter 
} = require('../middlewares/security');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================================
// ADMIN ROLE MIDDLEWARE
// ============================================================================

/**
 * Admin authorization middleware
 * Ensures only admin users can access these routes
 */
const requireAdmin = requireRole('admin');

// ============================================================================
// RATE LIMITING CONFIGURATION
// ============================================================================

// Standard admin rate limiter
const adminRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window (higher for admin operations)
  message: {
    success: false,
    message: 'Too many admin requests, please try again later',
    retryAfter: '15 minutes'
  }
});

// Strict rate limiter for destructive operations
const destructiveActionRateLimit = createStrictRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 destructive actions per hour
  message: {
    success: false,
    message: 'Too many destructive admin actions, please try again later',
    retryAfter: '1 hour'
  }
});

// Analytics rate limiter (less restrictive)
const analyticsRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 analytics requests per 5 minutes
  message: {
    success: false,
    message: 'Too many analytics requests, please try again later',
    retryAfter: '5 minutes'
  }
});

// ============================================================================
// LOGGING MIDDLEWARE
// ============================================================================

// Enhanced admin request logging
const logAdminRequest = (req, res, next) => {
  logger.warn('Admin API request', {
    method: req.method,
    path: req.path,
    adminId: req.user?.id,
    adminEmail: req.user?.email,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date(),
    params: req.params,
    query: req.query,
    // Don't log sensitive body data, just indicate presence
    hasBody: Object.keys(req.body || {}).length > 0
  });
  next();
};

// ============================================================================
// ADMIN DASHBOARD AND OVERVIEW ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard summary
 * @access  Admin only
 * @rateLimit Analytics rate limit
 */
router.get('/dashboard', 
  analyticsRateLimit,
  authenticate,
  requireAdmin,
  logAdminRequest,
  adminController.getDashboardSummary
);

/**
 * @route   GET /api/admin/analytics
 * @desc    Get system analytics
 * @access  Admin only
 * @rateLimit Analytics rate limit
 */
router.get('/analytics', 
  analyticsRateLimit,
  authenticate,
  requireAdmin,
  logAdminRequest,
  adminController.getSystemAnalytics
);

/**
 * @route   GET /api/admin/activity
 * @desc    Get admin activity log
 * @access  Admin only
 * @rateLimit Standard admin rate limit
 */
router.get('/activity', 
  adminRateLimit,
  authenticate,
  requireAdmin,
  logAdminRequest,
  adminController.getAdminActivity
);

// ============================================================================
// USER MANAGEMENT ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with filtering
 * @access  Admin only
 * @rateLimit Standard admin rate limit
 */
router.get('/users', 
  adminRateLimit,
  authenticate,
  requireAdmin,
  logAdminRequest,
  adminController.getAllUsers
);

/**
 * @route   POST /api/admin/users/:userId/ban
 * @desc    Ban or unban a user
 * @access  Admin only
 * @rateLimit Destructive action rate limit
 */
router.post('/users/:userId/ban', 
  destructiveActionRateLimit,
  authenticate,
  requireAdmin,
  logAdminRequest,
  adminController.toggleUserBan
);

/**
 * @route   GET /api/admin/search/users
 * @desc    Search users with admin privileges
 * @access  Admin only
 * @rateLimit Standard admin rate limit
 */
router.get('/search/users', 
  adminRateLimit,
  authenticate,
  requireAdmin,
  logAdminRequest,
  adminController.searchUsers
);

// ============================================================================
// CONTENT MANAGEMENT ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/posts
 * @desc    Get all posts including drafts and private
 * @access  Admin only
 * @rateLimit Standard admin rate limit
 */
router.get('/posts', 
  adminRateLimit,
  authenticate,
  requireAdmin,
  logAdminRequest,
  adminController.getAllPosts
);

/**
 * @route   DELETE /api/admin/posts/:postId
 * @desc    Delete a post as admin
 * @access  Admin only
 * @rateLimit Destructive action rate limit
 */
router.delete('/posts/:postId', 
  destructiveActionRateLimit,
  authenticate,
  requireAdmin,
  logAdminRequest,
  adminController.deletePost
);

/**
 * @route   POST /api/admin/posts/:postId/feature
 * @desc    Feature or unfeature a post
 * @access  Admin only
 * @rateLimit Standard admin rate limit
 */
router.post('/posts/:postId/feature', 
  adminRateLimit,
  authenticate,
  requireAdmin,
  logAdminRequest,
  adminController.togglePostFeatured
);

// ============================================================================
// MODERATION ROUTES
// ============================================================================

/**
 * @route   GET /api/admin/reports
 * @desc    Get reported content for moderation
 * @access  Admin only
 * @rateLimit Standard admin rate limit
 */
router.get('/reports', 
  adminRateLimit,
  authenticate,
  requireAdmin,
  logAdminRequest,
  adminController.getReportedContent
);

// ============================================================================
// HEALTH CHECK AND STATUS
// ============================================================================

/**
 * @route   GET /api/admin/health
 * @desc    Admin health check endpoint
 * @access  Admin only
 * @rateLimit Analytics rate limit
 */
router.get('/health', 
  analyticsRateLimit,
  authenticate,
  requireAdmin,
  (req, res) => {
    logger.info('Admin health check', {
      adminId: req.user.id,
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Admin API is healthy',
      data: {
        timestamp: new Date(),
        adminId: req.user.id,
        serverStatus: 'operational'
      }
    });
  }
);

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

// Admin route-specific error handler
router.use((error, req, res, next) => {
  // Enhanced error logging for admin routes
  logger.error('Admin route error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    adminId: req.user?.id,
    adminEmail: req.user?.email,
    ip: req.ip,
    timestamp: new Date(),
    // Log additional context for admin errors
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer')
  });
  
  // Don't expose internal error details to admin responses
  if (process.env.NODE_ENV === 'production') {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode < 500 ? error.message : 'Internal server error',
      error: {
        code: error.code || 'ADMIN_ERROR',
        timestamp: new Date()
      }
    });
  } else {
    // Pass to global error handler in development
    next(error);
  }
});

// 404 handler for undefined admin routes
router.use('*', (req, res) => {
  logger.warn('Admin route not found', {
    path: req.originalUrl,
    method: req.method,
    adminId: req.user?.id,
    ip: req.ip,
    timestamp: new Date()
  });

  res.status(404).json({
    success: false,
    message: 'Admin endpoint not found',
    error: {
      code: 'ADMIN_ROUTE_NOT_FOUND',
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date()
    }
  });
});

module.exports = router;
