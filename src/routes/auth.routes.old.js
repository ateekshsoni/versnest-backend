/**
 * Authentication Routes
 * 
 * This module defines all authentication-related routes including user registration,
 * login, logout, password management, and token refresh functionality.
 * 
 * Features:
 * - User registration with email verification
 * - Secure login with JWT tokens
 * - Password reset and change functionality
 * - Token refresh mechanism
 * - Account verification and management
 * - Multi-factor authentication support
 * 
 * Security:
 * - Strict rate limiting to prevent brute force attacks
 * - Input validation with Zod schemas
 * - Comprehensive logging for security monitoring
 * - CSRF protection and secure headers
 * 
 * Learning Notes:
 * - Authentication routes are public (no auth middleware)
 * - Rate limiting is more aggressive for security
 * - Sensitive operations require additional verification
 * - Response format avoids leaking sensitive information
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate, optionalAuth } = require('../middlewares/auth');
const { validate } = require('../middlewares/validation');
const authController = require('../controllers/auth.controller');
const { authSchemas } = require('../validators/schemas');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Strict rate limiting for authentication endpoints
 * Prevents brute force attacks and account enumeration
 */
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests to allow legitimate users
  skipSuccessfulRequests: true,
});

/**
 * Moderate rate limiting for registration
 * Allows legitimate registrations while preventing spam
 */
const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 registration attempts per hour
  message: {
    error: 'Too many registration attempts from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Very strict rate limiting for password reset
 * Prevents abuse of password reset functionality
 */
const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 2, // limit each IP to 2 password reset attempts per hour
  message: {
    error: 'Too many password reset attempts from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Middleware to log authentication attempts for security monitoring
 */
const logAuthAttempt = (req, res, next) => {
  logger.info('Authentication attempt', {
    action: req.route?.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    email: req.body?.email // Only log email for registration/login attempts
  });
  next();
};

/**
 * POST /api/auth/register
 * Register a new user account
 * 
 * Creates a new user account with email verification.
 * Returns user data and authentication tokens upon successful registration.
 */
router.post(
  '/register',
  registerRateLimit,
  logAuthAttempt,
  validate(authSchemas.register),
  authController.register
);

/**
 * POST /api/auth/login
 * Authenticate user and create session
 * 
 * Validates user credentials and returns JWT tokens for authentication.
 * Supports both email/password and username/password login.
 */
router.post(
  '/login',
  authRateLimit,
  logAuthAttempt,
  validate(authSchemas.login),
  authController.login
);

/**
 * POST /api/auth/logout
 * Logout user and invalidate tokens
 * 
 * Invalidates the current session and adds tokens to blacklist.
 * Clears authentication cookies and revokes refresh tokens.
 */
router.post(
  '/logout',
  authenticate,
  authController.logout
);

/**
 * POST /api/auth/logout-all
 * Logout from all devices
 * 
 * Invalidates all user sessions across all devices.
 * Useful for security when account is compromised.
 */
router.post(
  '/logout-all',
  authenticate,
  authController.logoutAll
);

/**
 * POST /api/auth/refresh
 * Refresh authentication tokens
 * 
 * Uses refresh token to generate new access token.
 * Maintains user session without requiring re-login.
 */
router.post(
  '/refresh',
  validate(authSchemas.refreshToken),
  authController.refreshToken
);

/**
 * POST /api/auth/forgot-password
 * Request password reset
 * 
 * Sends password reset email to user's registered email address.
 * Generates secure reset token with expiration.
 */
router.post(
  '/forgot-password',
  passwordResetRateLimit,
  logAuthAttempt,
  validate(authSchemas.forgotPassword),
  authController.forgotPassword
);

/**
 * POST /api/auth/reset-password
 * Reset password with token
 * 
 * Resets user password using the token from reset email.
 * Invalidates all existing sessions for security.
 */
router.post(
  '/reset-password',
  passwordResetRateLimit,
  logAuthAttempt,
  validate(authSchemas.resetPassword),
  authController.resetPassword
);

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 * 
 * Allows authenticated users to change their password.
 * Requires current password for verification.
 */
router.post(
  '/change-password',
  authenticate,
  validate(authSchemas.changePassword),
  authController.changePassword
);

/**
 * POST /api/auth/verify-email
 * Verify user email address
 * 
 * Verifies email address using token sent during registration.
 * Activates user account and enables full functionality.
 */
router.post(
  '/verify-email',
  validate(authSchemas.verifyEmail),
  authController.verifyEmail
);

/**
 * POST /api/auth/resend-verification
 * Resend email verification
 * 
 * Sends new verification email if previous one expired or was lost.
 * Rate limited to prevent spam.
 */
router.post(
  '/resend-verification',
  authRateLimit,
  authenticate,
  authController.resendVerification
);

/**
 * GET /api/auth/me
 * Get current user profile
 * 
 * Returns current authenticated user's profile information.
 * Useful for maintaining client-side user state.
 */
router.get(
  '/me',
  authenticate,
  authController.getCurrentUser
);

/**
 * GET /api/auth/verify-token
 * Verify if token is valid
 * 
 * Checks if the provided token is valid and not expired.
 * Returns token status and user information if valid.
 */
router.get(
  '/verify-token',
  optionalAuth,
  authController.verifyToken
);

/**
 * POST /api/auth/enable-2fa
 * Enable two-factor authentication
 * 
 * Enables 2FA for user account using TOTP (Time-based One-Time Password).
 * Returns QR code and backup codes for setup.
 */
router.post(
  '/enable-2fa',
  authenticate,
  validate(authSchemas.enable2FA),
  authController.enable2FA
);

/**
 * POST /api/auth/disable-2fa
 * Disable two-factor authentication
 * 
 * Disables 2FA for user account after password verification.
 * Removes all 2FA settings and backup codes.
 */
router.post(
  '/disable-2fa',
  authenticate,
  validate(authSchemas.disable2FA),
  authController.disable2FA
);

/**
 * POST /api/auth/verify-2fa
 * Verify 2FA code during login
 * 
 * Verifies TOTP code during the login process.
 * Completes authentication for users with 2FA enabled.
 */
router.post(
  '/verify-2fa',
  validate(authSchemas.verify2FA),
  authController.verify2FA
);

/**
 * GET /api/auth/sessions
 * Get active user sessions
 * 
 * Returns list of active sessions for the authenticated user.
 * Shows login times, devices, and locations for security monitoring.
 */
router.get(
  '/sessions',
  authenticate,
  authController.getActiveSessions
);

/**
 * DELETE /api/auth/sessions/:sessionId
 * Revoke specific session
 * 
 * Revokes a specific session by ID.
 * Allows users to logout from specific devices remotely.
 */
router.delete(
  '/sessions/:sessionId',
  authenticate,
  validate(authSchemas.revokeSession),
  authController.revokeSession
);

module.exports = router;
