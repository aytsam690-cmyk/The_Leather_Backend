const express = require('express');
const router = express.Router();
const filterController = require('../controllers/filterController');
const { dynamicMemCache } = require('../middleware/cache');

// Cache filters for 5 min — key includes category query param
router.get('/', dynamicMemCache('filters', 5 * 60 * 1000), filterController.getFilters);

module.exports = router;
