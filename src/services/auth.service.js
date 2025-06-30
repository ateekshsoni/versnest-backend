/**
 * 🔐 AUTHENTICATION SERVICE
 * 
 * This service handles all authentication-related business logic including
 * user registration, login, token management, and security features.
 * 
 * Key Features:
 * - User registration with validation
 * - Secure login with account lockout protection
 * - JWT access and refresh token management
 * - Password reset functionality
 * - Account security monitoring
 * - Device/session management
 * 
 * Learning Points:
 * - Separation of concerns in service layer
 * - Security best practices implementation
 * - Token lifecycle management
 * - Error handling in business logic
 */

const crypto = require('crypto');
const { CONFIG } = require('../config/index.js');
const { appLogger } = require('../utils/logger.js');
const { 
  AuthenticationError, 
  ConflictError, 
  ValidationError,
  ErrorFactory 
} = require('../utils/errors.js');
const User = require('../models/User.js');
const Token = require('../models/Token.js');

/**
 * 🔧 Authentication Service Class
 */
class AuthService {
  
  /**
   * 👤 Register a new user
   */
  async registerUser(userData) {
    const { email, password, role, ...otherData } = userData;
    
    try {
      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new ConflictError('An account with this email already exists');
      }
      
      // Create user based on role
      const user = new User({
        email: email.toLowerCase(),
        password,
        role,
        ...otherData,
      });
      
      // Save user
      await user.save();
      
      // Generate tokens
      const tokens = await this.generateTokens(user);
      
      // Log successful registration
      appLogger.info('User registered successfully', {
        userId: user._id,
        email: user.email,
        role: user.role,
      });
      
      return {
        user: this.sanitizeUser(user),
        tokens,
      };
      
    } catch (error) {
      appLogger.error('User registration failed', {
        email,
        role,
        error: error.message,
      });
      
      throw error;
    }
  }
  
  /**
   * 🔑 Authenticate user login
   */
  async loginUser(email, password, deviceInfo = {}) {
    try {
      // Find user with password
      const user = await User.findByEmail(email.toLowerCase());
      if (!user) {
        throw new AuthenticationError('Invalid email or password');
      }
      
      // Check if account is locked
      if (user.isLocked) {
        appLogger.error('Login attempt on locked account', {
          userId: user._id,
          email: user.email,
          lockUntil: user.lockUntil,
        });
        
        throw new AuthenticationError('Account is temporarily locked due to too many failed attempts');
      }
      
      // Check if account is banned
      if (user.isCurrentlyBanned) {
        appLogger.error('Login attempt on banned account', {
          userId: user._id,
          email: user.email,
          banReason: user.banReason,
        });
        
        throw new AuthenticationError('Account is banned');
      }
      
      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        // Increment login attempts
        await user.incLoginAttempts();
        
        appLogger.warn('Login failed - invalid password', {
          userId: user._id,
          email: user.email,
          loginAttempts: user.loginAttempts + 1,
        });
        
        throw new AuthenticationError('Invalid email or password');
      }
      
      // Reset login attempts on successful login
      await user.resetLoginAttempts();
      
      // Generate tokens
      const tokens = await this.generateTokens(user, deviceInfo);
      
      // Log successful login
      appLogger.info('User logged in successfully', {
        userId: user._id,
        email: user.email,
        role: user.role,
        deviceInfo,
      });
      
      return {
        user: this.sanitizeUser(user),
        tokens,
      };
      
    } catch (error) {
      appLogger.error('Login failed', {
        email,
        error: error.message,
        deviceInfo,
      });
      
      throw error;
    }
  }
  
  /**
   * 🔄 Refresh access token
   */
  async refreshToken(refreshTokenString, deviceInfo = {}) {
    try {
      // Find and validate refresh token
      const tokenDoc = await Token.findValidToken(refreshTokenString, 'refresh');
      if (!tokenDoc) {
        throw new AuthenticationError('Invalid or expired refresh token');
      }
      
      // Get user
      const user = await User.findById(tokenDoc.user);
      if (!user || !user.isActive) {
        throw new AuthenticationError('User account is not active');
      }
      
      // Update token usage
      await tokenDoc.use();
      
      // Generate new access token
      const accessToken = user.generateAccessToken();
      
      // Log token refresh
      appLogger.logAuth('token_refreshed', {
        userId: user._id,
        sessionId: tokenDoc.sessionId,
        deviceInfo,
      });
      
      return {
        accessToken,
        user: this.sanitizeUser(user),
      };
      
    } catch (error) {
      appLogger.logAuth('token_refresh_failed', {
        error: error.message,
        deviceInfo,
      });
      
      throw error;
    }
  }
  
  /**
   * 🚪 Logout user
   */
  async logoutUser(userId, tokenString, sessionId = null) {
    try {
      // Blacklist the access token
      await Token.blacklistToken(tokenString, userId, 'logout');
      
      // Revoke refresh token for this session if provided
      if (sessionId) {
        await Token.updateMany(
          { 
            user: userId, 
            sessionId, 
            tokenType: 'refresh',
            isActive: true 
          },
          { 
            $set: { 
              isActive: false, 
              revokedAt: new Date(),
              revocationReason: 'logout'
            }
          }
        );
      }
      
      // Log logout
      appLogger.logAuth('user_logged_out', {
        userId,
        sessionId,
      });
      
      return { message: 'Logged out successfully' };
      
    } catch (error) {
      appLogger.error('Logout failed', {
        userId,
        error: error.message,
      });
      
      throw error;
    }
  }
  
  /**
   * 🚪 Logout from all devices
   */
  async logoutAllDevices(userId) {
    try {
      // Revoke all user tokens
      await Token.revokeAllUserTokens(userId, 'logout_all_devices');
      
      // Log logout from all devices
      appLogger.logAuth('user_logged_out_all_devices', {
        userId,
      });
      
      return { message: 'Logged out from all devices successfully' };
      
    } catch (error) {
      appLogger.error('Logout all devices failed', {
        userId,
        error: error.message,
      });
      
      throw error;
    }
  }
  
  /**
   * 🔒 Change password
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Get user with password
      const user = await User.findById(userId).select('+password');
      if (!user) {
        throw new AuthenticationError('User not found');
      }
      
      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        throw new AuthenticationError('Current password is incorrect');
      }
      
      // Update password
      user.password = newPassword;
      user.passwordChangedAt = new Date();
      await user.save();
      
      // Revoke all existing tokens (force re-login)
      await Token.revokeAllUserTokens(userId, 'password_change');
      
      // Log password change
      appLogger.logSecurity('password_changed', 'medium', {
        userId,
        email: user.email,
      });
      
      return { message: 'Password changed successfully. Please log in again.' };
      
    } catch (error) {
      appLogger.logSecurity('password_change_failed', 'medium', {
        userId,
        error: error.message,
      });
      
      throw error;
    }
  }
  
  /**
   * 🔄 Request password reset
   */
  async requestPasswordReset(email) {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        // Don't reveal if email exists
        return { message: 'If an account with that email exists, a reset link has been sent.' };
      }
      
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      // Create token document
      await Token.createToken({
        token: resetToken,
        tokenType: 'reset_password',
        user: user._id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });
      
      // In a real application, you would send an email here
      // For now, we'll just log it
      appLogger.logBusiness('password_reset_requested', {
        userId: user._id,
        email: user.email,
      });
      
      return { 
        message: 'If an account with that email exists, a reset link has been sent.',
        resetToken: CONFIG.NODE_ENV === 'development' ? resetToken : undefined // Only return in development
      };
      
    } catch (error) {
      appLogger.error('Password reset request failed', {
        email,
        error: error.message,
      });
      
      throw error;
    }
  }
  
  /**
   * 🔐 Reset password with token
   */
  async resetPassword(email, resetToken, newPassword) {
    try {
      // Find user
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        throw new AuthenticationError('Invalid reset token');
      }
      
      // Find and validate reset token
      const tokenDoc = await Token.findValidToken(resetToken, 'reset_password');
      if (!tokenDoc || !tokenDoc.user.equals(user._id)) {
        throw new AuthenticationError('Invalid or expired reset token');
      }
      
      // Update password
      user.password = newPassword;
      user.passwordChangedAt = new Date();
      await user.save();
      
      // Revoke the reset token
      await tokenDoc.revoke('used');
      
      // Revoke all existing tokens (force re-login)
      await Token.revokeAllUserTokens(user._id, 'password_reset');
      
      // Log password reset
      appLogger.logSecurity('password_reset_completed', 'medium', {
        userId: user._id,
        email: user.email,
      });
      
      return { message: 'Password reset successfully. Please log in with your new password.' };
      
    } catch (error) {
      appLogger.logSecurity('password_reset_failed', 'medium', {
        email,
        error: error.message,
      });
      
      throw error;
    }
  }
  
  /**
   * 👤 Get user profile
   */
  async getUserProfile(userId) {
    try {
      const user = await User.findById(userId).select('-password');
      if (!user) {
        throw new AuthenticationError('User not found');
      }
      
      return this.sanitizeUser(user);
      
    } catch (error) {
      appLogger.error('Get user profile failed', {
        userId,
        error: error.message,
      });
      
      throw error;
    }
  }
  
  /**
   * 📱 Get user sessions
   */
  async getUserSessions(userId) {
    try {
      const sessions = await Token.getUserActiveSessions(userId);
      
      return sessions.map(session => ({
        sessionId: session.sessionId,
        deviceInfo: session.deviceInfo,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
      }));
      
    } catch (error) {
      appLogger.error('Get user sessions failed', {
        userId,
        error: error.message,
      });
      
      throw error;
    }
  }
  
  /**
   * 🔐 Revoke session
   */
  async revokeSession(userId, sessionId) {
    try {
      const result = await Token.updateMany(
        { 
          user: userId, 
          sessionId, 
          isActive: true 
        },
        { 
          $set: { 
            isActive: false, 
            revokedAt: new Date(),
            revocationReason: 'manual_revocation'
          }
        }
      );
      
      appLogger.logAuth('session_revoked', {
        userId,
        sessionId,
        revokedTokens: result.modifiedCount,
      });
      
      return { message: 'Session revoked successfully' };
      
    } catch (error) {
      appLogger.error('Revoke session failed', {
        userId,
        sessionId,
        error: error.message,
      });
      
      throw error;
    }
  }
  
  /**
   * 🔧 Private Helper Methods
   */
  
  /**
   * Generate access and refresh tokens
   */
  async generateTokens(user, deviceInfo = {}) {
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    // Generate access token
    const accessToken = user.generateAccessToken();
    
    // Generate refresh token
    const refreshToken = user.generateRefreshToken();
    
    // Store refresh token in database
    await Token.createToken({
      token: refreshToken,
      tokenType: 'refresh',
      user: user._id,
      sessionId,
      deviceInfo,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
    
    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: CONFIG.JWT_EXPIRES_IN,
    };
  }
  
  /**
   * Remove sensitive data from user object
   */
  sanitizeUser(user) {
    const sanitized = user.toObject();
    delete sanitized.password;
    delete sanitized.loginAttempts;
    delete sanitized.lockUntil;
    delete sanitized.__v;
    return sanitized;
  }
  
  /**
   * Validate user data for registration
   */
  validateRegistrationData(userData) {
    const { email, password, role, fullName } = userData;
    
    const errors = [];
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: 'email', message: 'Valid email is required' });
    }
    
    if (!password || password.length < 8) {
      errors.push({ 
        field: 'password', 
        message: 'Password must be at least 8 characters' 
      });
    }
    
    if (!role || !['reader', 'writer'].includes(role)) {
      errors.push({ field: 'role', message: 'Role must be either reader or writer' });
    }
    
    if (!fullName || fullName.trim().length < 2) {
      errors.push({ field: 'fullName', message: 'Full name must be at least 2 characters' });
    }
    
    if (errors.length > 0) {
      throw new ValidationError('Registration validation failed', errors);
    }
  }
}

// Export singleton instance
module.exports = new AuthService();
