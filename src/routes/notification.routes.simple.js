/**
 * Simple Notification Routes
 * Basic notification routes for testing the integration
 */

const express = require('express');
const router = express.Router();

// Placeholder routes
router.get('/', (req, res) => {
  res.json({ message: 'Notification routes working' });
});

module.exports = router;
