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

router.get('/', getBanners);

// Admin Routes
router.post('/', protect, admin, createBanner);
router.post('/reorder', protect, admin, reorderBanners);
router.put('/:id', protect, admin, updateBanner);
router.delete('/:id', protect, admin, deleteBanner);

module.exports = router;
