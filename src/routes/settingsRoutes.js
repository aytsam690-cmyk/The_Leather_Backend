const express = require('express');
const router = express.Router();
const { getSettings } = require('../controllers/adminController');
const { memCache } = require('../middleware/cache');

// Public route to get store settings (like site name, logo, currency, etc.)
router.get('/', memCache('settings'), getSettings);

module.exports = router;
