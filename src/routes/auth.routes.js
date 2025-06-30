/**
 * Simple Authentication Routes
 * Basic authentication routes for testing the integration
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
// const { validate } = require('../middlewares/validation');
// const { authSchemas } = require('../validators/schemas');
const authController = require('../controllers/auth.controller');

const router = express.Router();

// Basic rate limiting
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts from this IP, please try again later.',
  },
});

// Routes
router.post('/register', authRateLimit, authController.register);
router.post('/login', authRateLimit, authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/forgot-password', authRateLimit, authController.forgotPassword);
router.post('/reset-password', authRateLimit, authController.resetPassword);
router.get('/me', authController.getCurrentUser);

module.exports = router;