const express = require('express');
const router = express.Router();
const { protect, optionalProtect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const {
  validateCoupon,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCoupon
} = require('../controllers/couponController');

// Customer — guests can also validate (per-user check skipped for guests)
router.post('/validate', optionalProtect, validateCoupon);

// Admin Routes
router.get('/', protect, admin, getCoupons);
router.post('/', protect, admin, createCoupon);
router.put('/:id/toggle', protect, admin, toggleCoupon);
router.put('/:id', protect, admin, updateCoupon);
router.delete('/:id', protect, admin, deleteCoupon);

module.exports = router;
