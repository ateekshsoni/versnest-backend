/**
 * Authentication Controller
 * 
 * This controller handles all HTTP requests related to user authentication
 * including registration, login, logout, and password management.
 * It acts as the bridge between the HTTP layer and the authentication service.
 * 
 * Features:
 * - User registration and login
 * - JWT token management
 * - Password reset functionality
 * - Session management
 * - Account verification
 * 
 * Learning Notes:
 * - Controllers focus on HTTP concerns (request/response handling)
 * - Business logic is delegated to services
 * - Consistent error handling and response formatting
 * - Comprehensive logging for security monitoring
 * - Input validation happens at middleware level
 */

const authService = require('../services/auth.service');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');

class AuthController {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  async register(req, res, next) {
    try {
      const { fullName, email, password, role, bio, location } = req.body;

      logger.info('User registration attempt', { email, fullName });

      const result = await authService.registerUser({
        fullName,
        email,
        password,
        role,
        bio,
        location
      });

      // Set JWT tokens in cookies
      res.cookie('accessToken', result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return successResponse(res, {
        user: result.user,
        tokens: result.tokens
      }, 'User registered successfully', 201);
    } catch (error) {
      logger.error('Registration error', { error: error.message, email: req.body.email });
      next(error);
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      logger.info('User login attempt', { email });

      const result = await authService.loginUser(email, password);

      // Set JWT tokens in cookies
      res.cookie('accessToken', result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return successResponse(res, {
        user: result.user,
        tokens: result.tokens
      }, 'Login successful');
    } catch (error) {
      logger.error('Login error', { error: error.message, email: req.body.email });
      next(error);
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const tokenFromCookie = req.cookies.refreshToken;

      const token = refreshToken || tokenFromCookie;

      if (!token) {
        return errorResponse(res, 'Refresh token is required', 400);
      }

      logger.info('Token refresh attempt');

      const result = await authService.refreshToken(token);

      // Set new access token in cookie
      res.cookie('accessToken', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      return successResponse(res, {
        accessToken: result.accessToken,
        user: result.user
      }, 'Token refreshed successfully');
    } catch (error) {
      logger.error('Token refresh error', { error: error.message });
      next(error);
    }
  }

  /**
   * Logout user
   * POST /api/auth/logout
   */
  async logout(req, res, next) {
    try {
      const userId = req.user.id;
      const refreshToken = req.cookies.refreshToken;

      logger.info('User logout', { userId });

      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      // Clear cookies
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');

      return successResponse(res, null, 'Logout successful');
    } catch (error) {
      logger.error('Logout error', { error: error.message, userId: req.user?.id });
      next(error);
    }
  }

  /**
   * Logout from all devices
   * POST /api/auth/logout-all
   */
  async logoutAll(req, res, next) {
    try {
      const userId = req.user.id;

      logger.info('User logout all devices', { userId });

      await authService.logoutAll(userId);

      // Clear cookies
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');

      return successResponse(res, null, 'Logged out from all devices successfully');
    } catch (error) {
      logger.error('Logout all error', { error: error.message, userId: req.user?.id });
      next(error);
    }
  }

  /**
   * Get current user
   * GET /api/auth/me
   */
  async getCurrentUser(req, res, next) {
    try {
      const userId = req.user.id;

      logger.info('Get current user', { userId });

      const user = await authService.getCurrentUser(userId);

      return successResponse(res, { user }, 'User retrieved successfully');
    } catch (error) {
      logger.error('Get current user error', { error: error.message, userId: req.user?.id });
      next(error);
    }
  }

  /**
   * Change password
   * POST /api/auth/change-password
   */
  async changePassword(req, res, next) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      logger.info('Password change attempt', { userId });

      await authService.changePassword(userId, currentPassword, newPassword);

      return successResponse(res, null, 'Password changed successfully');
    } catch (error) {
      logger.error('Change password error', { error: error.message, userId: req.user?.id });
      next(error);
    }
  }

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;

      logger.info('Password reset requested', { email });

      await authService.requestPasswordReset(email);

      return successResponse(res, null, 'Password reset email sent successfully');
    } catch (error) {
      logger.error('Forgot password error', { error: error.message, email: req.body.email });
      next(error);
    }
  }

  /**
   * Reset password
   * POST /api/auth/reset-password
   */
  async resetPassword(req, res, next) {
    try {
      const { token, newPassword } = req.body;

      logger.info('Password reset attempt');

      await authService.resetPassword(token, newPassword);

      return successResponse(res, null, 'Password reset successfully');
    } catch (error) {
      logger.error('Reset password error', { error: error.message });
      next(error);
    }
  }

  /**
   * Verify email
   * POST /api/auth/verify-email
   */
  async verifyEmail(req, res, next) {
    try {
      const { token } = req.body;

      logger.info('Email verification attempt');

      await authService.verifyEmail(token);

      return successResponse(res, null, 'Email verified successfully');
    } catch (error) {
      logger.error('Email verification error', { error: error.message });
      next(error);
    }
  }

  /**
   * Resend verification email
   * POST /api/auth/resend-verification
   */
  async resendVerification(req, res, next) {
    try {
      const userId = req.user.id;

      logger.info('Resend verification email', { userId });

      await authService.resendVerificationEmail(userId);

      return successResponse(res, null, 'Verification email sent successfully');
    } catch (error) {
      logger.error('Resend verification error', { error: error.message, userId: req.user?.id });
      next(error);
    }
  }

  /**
   * Verify token
   * GET /api/auth/verify-token
   */
  async verifyToken(req, res, next) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies.accessToken;

      if (!token) {
        return errorResponse(res, 'No token provided', 401);
      }

      const result = await authService.verifyToken(token);

      return successResponse(res, {
        valid: true,
        user: result.user
      }, 'Token is valid');
    } catch (error) {
      logger.error('Token verification error', { error: error.message });
      return errorResponse(res, 'Invalid token', 401);
    }
  }

  /**
   * Enable 2FA
   * POST /api/auth/enable-2fa
   */
  async enable2FA(req, res, next) {
    try {
      const userId = req.user.id;
      const { password } = req.body;

      logger.info('Enable 2FA attempt', { userId });

      const result = await authService.enable2FA(userId, password);

      return successResponse(res, result, '2FA enabled successfully');
    } catch (error) {
      logger.error('Enable 2FA error', { error: error.message, userId: req.user?.id });
      next(error);
    }
  }

  /**
   * Disable 2FA
   * POST /api/auth/disable-2fa
   */
  async disable2FA(req, res, next) {
    try {
      const userId = req.user.id;
      const { password } = req.body;

      logger.info('Disable 2FA attempt', { userId });

      await authService.disable2FA(userId, password);

      return successResponse(res, null, '2FA disabled successfully');
    } catch (error) {
      logger.error('Disable 2FA error', { error: error.message, userId: req.user?.id });
      next(error);
    }
  }

  /**
   * Verify 2FA
   * POST /api/auth/verify-2fa
   */
  async verify2FA(req, res, next) {
    try {
      const { token, email } = req.body;

      logger.info('2FA verification attempt', { email });

      const result = await authService.verify2FA(email, token);

      // Set JWT tokens in cookies
      res.cookie('accessToken', result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return successResponse(res, {
        user: result.user,
        tokens: result.tokens
      }, '2FA verification successful');
    } catch (error) {
      logger.error('2FA verification error', { error: error.message, email: req.body.email });
      next(error);
    }
  }

  /**
   * Get active sessions
   * GET /api/auth/sessions
   */
  async getActiveSessions(req, res, next) {
    try {
      const userId = req.user.id;

      logger.info('Get active sessions', { userId });

      const sessions = await authService.getActiveSessions(userId);

      return successResponse(res, { sessions }, 'Active sessions retrieved successfully');
    } catch (error) {
      logger.error('Get sessions error', { error: error.message, userId: req.user?.id });
      next(error);
    }
  }

  /**
   * Revoke session
   * DELETE /api/auth/sessions/:sessionId
   */
  async revokeSession(req, res, next) {
    try {
      const userId = req.user.id;
      const { sessionId } = req.params;

      logger.info('Revoke session', { userId, sessionId });

      await authService.revokeSession(userId, sessionId);

      return successResponse(res, null, 'Session revoked successfully');
    } catch (error) {
      logger.error('Revoke session error', { error: error.message, userId: req.user?.id });
      next(error);
    }
  }
}

module.exports = new AuthController();
