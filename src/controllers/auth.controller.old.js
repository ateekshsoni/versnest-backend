/**
 * 🔐 AUTHENTICATION CONTROLLER
 * 
 * This controller handles all authentication-related HTTP requests and responses.
 * It acts as the interface between the HTTP layer and the business logic layer.
 * 
 * Key Features:
 * - User registration and login
 * - Token management (access/refresh)
 * - Password reset functionality
 * - Session management
 * - Security response handling
 * 
 * Learning Points:
 * - Controller responsibility separation
 * - HTTP status code best practices
 * - Cookie security settings
 * - Response consistency
 */

const { CONFIG } = require('../config/index.js');
const logger = require('../utils/logger.js');
const { asyncHandler } = require('../middlewares/errorHandler.js');
const authService = require('../services/auth.service.js');
const { successResponse, errorResponse } = require('../utils/response.js');

/**
 * 🔧 Cookie Options for Tokens
 */
const getCookieOptions = (isRefreshToken = false) => ({
  httpOnly: true,
  secure: CONFIG.isProduction,
  sameSite: CONFIG.isProduction ? 'strict' : 'lax',
  maxAge: isRefreshToken ? 7 * 24 * 60 * 60 * 1000 : 15 * 60 * 1000, // 7 days for refresh, 15 min for access
  path: isRefreshToken ? '/auth/refresh' : '/',
});

/**
 * 👤 Register User
 * @route POST /auth/register
 * @access Public
 */
export const register = asyncHandler(async (req, res) => {
  const { role } = req.body;
  
  // Use appropriate validation schema based on role
  const validationSchema = role === 'writer' ? schemas.writerRegistration : schemas.readerRegistration;
  const validateRequest = createValidationMiddleware(validationSchema);
  
  // Validate request
  await new Promise((resolve, reject) => {
    validateRequest(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  
  // Extract device info
  const deviceInfo = {
    userAgent: req.get('User-Agent'),
    ipAddress: req.ip,
    platform: req.get('sec-ch-ua-platform'),
    browser: req.get('sec-ch-ua'),
  };
  
  // Register user
  const result = await authService.registerUser({
    ...req.body,
    deviceInfo,
  });
  
  // Set cookies
  res.cookie('accessToken', result.tokens.accessToken, getCookieOptions(false));
  res.cookie('refreshToken', result.tokens.refreshToken, getCookieOptions(true));
  
  // Log successful registration
  appLogger.logBusiness('user_registration_success', {
    userId: result.user._id,
    email: result.user.email,
    role: result.user.role,
    ip: req.ip,
  });
  
  res.status(201).json({
    success: true,
    message: `${result.user.role} account created successfully`,
    data: {
      user: result.user,
      tokens: {
        accessToken: result.tokens.accessToken,
        expiresIn: result.tokens.expiresIn,
      },
    },
  });
});

/**
 * 🔑 Login User
 * @route POST /auth/login
 * @access Public
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  // Extract device info
  const deviceInfo = {
    userAgent: req.get('User-Agent'),
    ipAddress: req.ip,
    platform: req.get('sec-ch-ua-platform'),
    browser: req.get('sec-ch-ua'),
  };
  
  // Authenticate user
  const result = await authService.loginUser(email, password, deviceInfo);
  
  // Set cookies
  res.cookie('accessToken', result.tokens.accessToken, getCookieOptions(false));
  res.cookie('refreshToken', result.tokens.refreshToken, getCookieOptions(true));
  
  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: result.user,
      tokens: {
        accessToken: result.tokens.accessToken,
        expiresIn: result.tokens.expiresIn,
      },
    },
  });
});

/**
 * 🔄 Refresh Token
 * @route POST /auth/refresh
 * @access Public (with refresh token)
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const refreshTokenString = req.cookies.refreshToken || req.body.refreshToken;
  
  // Extract device info
  const deviceInfo = {
    userAgent: req.get('User-Agent'),
    ipAddress: req.ip,
  };
  
  // Refresh token
  const result = await authService.refreshToken(refreshTokenString, deviceInfo);
  
  // Set new access token cookie
  res.cookie('accessToken', result.accessToken, getCookieOptions(false));
  
  res.status(200).json({
    success: true,
    message: 'Token refreshed successfully',
    data: {
      accessToken: result.accessToken,
      user: result.user,
    },
  });
});

/**
 * 🚪 Logout User
 * @route POST /auth/logout
 * @access Private
 */
export const logout = asyncHandler(async (req, res) => {
  const token = req.token;
  const sessionId = req.tokenDoc?.sessionId;
  
  // Logout user
  await authService.logoutUser(req.user._id, token, sessionId);
  
  // Clear cookies
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * 🚪 Logout from All Devices
 * @route POST /auth/logout-all
 * @access Private
 */
export const logoutAll = asyncHandler(async (req, res) => {
  // Logout from all devices
  await authService.logoutAllDevices(req.user._id);
  
  // Clear cookies
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  
  res.status(200).json({
    success: true,
    message: 'Logged out from all devices successfully',
  });
});

/**
 * 👤 Get Current User Profile
 * @route GET /auth/me
 * @access Private
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getUserProfile(req.user._id);
  
  res.status(200).json({
    success: true,
    data: {
      user,
    },
  });
});

/**
 * 🔒 Change Password
 * @route PUT /auth/change-password
 * @access Private
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  // Change password
  const result = await authService.changePassword(
    req.user._id,
    currentPassword,
    newPassword
  );
  
  // Clear cookies to force re-login
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  
  res.status(200).json({
    success: true,
    message: result.message,
  });
});

/**
 * 🔄 Request Password Reset
 * @route POST /auth/reset-password-request
 * @access Public
 */
export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  // Request password reset
  const result = await authService.requestPasswordReset(email);
  
  res.status(200).json({
    success: true,
    message: result.message,
    ...(CONFIG.isDevelopment && { resetToken: result.resetToken }),
  });
});

/**
 * 🔐 Reset Password
 * @route POST /auth/reset-password
 * @access Public
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, token, newPassword } = req.body;
  
  // Reset password
  const result = await authService.resetPassword(email, token, newPassword);
  
  res.status(200).json({
    success: true,
    message: result.message,
  });
});

/**
 * 📱 Get User Sessions
 * @route GET /auth/sessions
 * @access Private
 */
export const getSessions = asyncHandler(async (req, res) => {
  const sessions = await authService.getUserSessions(req.user._id);
  
  res.status(200).json({
    success: true,
    data: {
      sessions,
      count: sessions.length,
    },
  });
});

/**
 * 🔐 Revoke Session
 * @route DELETE /auth/sessions/:sessionId
 * @access Private
 */
export const revokeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  // Revoke session
  const result = await authService.revokeSession(req.user._id, sessionId);
  
  res.status(200).json({
    success: true,
    message: result.message,
  });
});

/**
 * 🔍 Verify Token
 * @route GET /auth/verify
 * @access Private
 */
export const verifyToken = asyncHandler(async (req, res) => {
  // If we reach here, the token is valid (middleware validates it)
  res.status(200).json({
    success: true,
    message: 'Token is valid',
    data: {
      user: req.user,
      tokenInfo: {
        issuedAt: new Date(req.user.iat * 1000),
        expiresAt: new Date(req.user.exp * 1000),
      },
    },
  });
});

/**
 * 📊 Get Auth Status
 * @route GET /auth/status
 * @access Public
 */
export const getAuthStatus = asyncHandler(async (req, res) => {
  const isAuthenticated = !!req.user;
  
  res.status(200).json({
    success: true,
    data: {
      isAuthenticated,
      user: isAuthenticated ? req.user : null,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * 🔧 Validation Middleware Exports
 */
export const validateRegister = (req, res, next) => {
  const { role } = req.body;
  const schema = role === 'writer' ? schemas.writerRegistration : schemas.readerRegistration;
  return createValidationMiddleware(schema)(req, res, next);
};

export const validateLogin = createValidationMiddleware(schemas.login);
export const validateChangePassword = createValidationMiddleware(schemas.changePassword);
export const validatePasswordResetRequest = createValidationMiddleware(schemas.passwordResetRequest);
export const validatePasswordReset = createValidationMiddleware(schemas.passwordReset);

// Export all controller functions
export default {
  register,
  login,
  refreshToken,
  logout,
  logoutAll,
  getMe,
  changePassword,
  requestPasswordReset,
  resetPassword,
  getSessions,
  revokeSession,
  verifyToken,
  getAuthStatus,
  
  // Validation middleware
  validateRegister,
  validateLogin,
  validateChangePassword,
  validatePasswordResetRequest,
  validatePasswordReset,
};
