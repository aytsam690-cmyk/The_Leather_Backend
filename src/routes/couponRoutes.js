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

const rateLimit = require('express-rate-limit');

const couponValidateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 coupon attempts per IP per 15 min — prevents brute-force
  message: { message: 'Too many coupon attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Customer — guests can also validate (per-user check skipped for guests)
router.post('/validate', couponValidateLimiter, optionalProtect, validateCoupon);

// Admin Routes
router.get('/', protect, admin, getCoupons);
router.post('/', protect, admin, createCoupon);
router.put('/:id/toggle', protect, admin, toggleCoupon);
router.put('/:id', protect, admin, updateCoupon);
router.delete('/:id', protect, admin, deleteCoupon);

module.exports = router;
