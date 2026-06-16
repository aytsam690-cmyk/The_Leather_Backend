const express = require('express');
const router = express.Router();
const { getSettings } = require('../controllers/adminController');

// Public route to get store settings (like site name, logo, currency, etc.)
router.get('/', getSettings);

module.exports = router;
