/**
 * Simple Post Routes
 * Basic post routes for testing the integration
 */

const express = require('express');
const router = express.Router();

// Placeholder routes
router.get('/', (req, res) => {
  res.json({ message: 'Post routes working' });
});

router.post('/', (req, res) => {
  res.json({ message: 'Create post endpoint' });
});

module.exports = router;
