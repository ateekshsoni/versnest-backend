/**
 * Simple Admin Routes
 * Basic admin routes for testing the integration
 */

const express = require('express');
const router = express.Router();

// Placeholder routes
router.get('/', (req, res) => {
  res.json({ message: 'Admin routes working' });
});

module.exports = router;
