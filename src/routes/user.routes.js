/**
 * Simple User Routes
 * Basic user routes for testing the integration
 */

const express = require('express');
const router = express.Router();

// Placeholder routes
router.get('/', (req, res) => {
  res.json({ message: 'User routes working' });
});

router.get('/profile', (req, res) => {
  res.json({ message: 'User profile endpoint' });
});

module.exports = router;
