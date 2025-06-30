/**
 * Simple Comment Routes
 * Basic comment routes for testing the integration
 */

const express = require('express');
const router = express.Router();

// Placeholder routes
router.get('/', (req, res) => {
  res.json({ message: 'Comment routes working' });
});

module.exports = router;
