const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const {
  getBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  reorderBanners
} = require('../controllers/bannerController');
const { memCache, invalidateCache } = require('../middleware/cache');

router.get('/', memCache('banners'), getBanners);

// Admin Routes — invalidate cache on changes
const bust = (req, res, next) => { invalidateCache('banners'); next(); };
router.post('/', protect, admin, bust, createBanner);
router.post('/reorder', protect, admin, bust, reorderBanners);
router.put('/:id', protect, admin, bust, updateBanner);
router.delete('/:id', protect, admin, bust, deleteBanner);

module.exports = router;
