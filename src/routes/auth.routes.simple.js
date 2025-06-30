/**
 * Simple Authentication Routes
 * Basic authentication routes for testing the integration
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middlewares/validation');
const { authSchemas } = require('../validators/schemas');
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
router.post('/register', authRateLimit, validate(authSchemas.register), authController.register);
router.post('/login', authRateLimit, validate(authSchemas.login), authController.login);
router.post('/refresh', validate(authSchemas.refreshToken), authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/forgot-password', authRateLimit, validate(authSchemas.forgotPassword), authController.forgotPassword);
router.post('/reset-password', authRateLimit, validate(authSchemas.resetPassword), authController.resetPassword);
router.get('/me', authController.getCurrentUser);

module.exports = router;
