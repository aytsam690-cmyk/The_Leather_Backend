const asyncHandler = require('express-async-handler');
const Coupon = require('../models/Coupon');

// @desc    Validate a coupon code and return discount
// @route   POST /api/coupons/validate
// @access  Private
const validateCoupon = asyncHandler(async (req, res) => {
  const { code, orderAmount, subtotal } = req.body;
  const amount = orderAmount || subtotal || 0;

  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

  if (!coupon) {
    res.status(404);
    throw new Error('Invalid or expired coupon code');
  }

  // Check dates
  const now = new Date();
  if (now < coupon.validFrom || now > coupon.validUntil) {
    res.status(400);
    throw new Error('Coupon is expired or not yet active');
  }

  // Check min order amount
  if (amount < coupon.minOrderAmount) {
    res.status(400);
    throw new Error(`Minimum order amount of ${coupon.minOrderAmount} required`);
  }

  // Check usage limit
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    res.status(400);
    throw new Error('Coupon usage limit reached');
  }

  // Check if user already used it (skip for guests)
  if (req.user && coupon.usedBy.some(id => id.toString() === req.user._id.toString())) {
    res.status(400);
    throw new Error('You have already used this coupon');
  }

  // Calculate discount
  let discountAmount = 0;
  if (coupon.type === 'percentage') {
    discountAmount = (amount * coupon.value) / 100;
    if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
      discountAmount = coupon.maxDiscount;
    }
  } else {
    discountAmount = coupon.value;
    if (discountAmount > amount) discountAmount = amount;
  }

  res.json({
    couponId: coupon._id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    discountAmount,
    message: 'Coupon applied successfully'
  });
});

// @desc    Get all coupons
// @route   GET /api/coupons
// @access  Private/Admin
const getCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find({}).sort('-createdAt');
  res.json(coupons);
});

// @desc    Create a coupon
// @route   POST /api/coupons
// @access  Private/Admin
const createCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.create(req.body);
  res.status(201).json(coupon);
});

// @desc    Update a coupon
// @route   PUT /api/coupons/:id
// @access  Private/Admin
const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (coupon) {
    res.json(coupon);
  } else {
    res.status(404);
    throw new Error('Coupon not found');
  }
});

// @desc    Delete a coupon
// @route   DELETE /api/coupons/:id
// @access  Private/Admin
const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (coupon) {
    res.json({ message: 'Coupon removed' });
  } else {
    res.status(404);
    throw new Error('Coupon not found');
  }
});

// @desc    Toggle coupon active status
// @route   PUT /api/coupons/:id/toggle
// @access  Private/Admin
const toggleCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (coupon) {
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json(coupon);
  } else {
    res.status(404);
    throw new Error('Coupon not found');
  }
});

module.exports = {
  validateCoupon,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCoupon
};
