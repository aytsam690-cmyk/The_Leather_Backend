const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

// Helper: strip HTML tags
const stripHtml = (str) => String(str || '').replace(/<[^>]*>/g, '').trim();

// Helper: recalculate product ratings
const recalcRatings = async (productId) => {
  const approvedReviews = await Review.find({ product: productId, isApproved: true });
  const count = approvedReviews.length;
  const average = count > 0 ? approvedReviews.reduce((acc, r) => acc + r.rating, 0) / count : 0;
  await Product.findByIdAndUpdate(productId, { 'ratings.average': average, 'ratings.count': count });
};

// @desc    Create review (logged-in user)
// @route   POST /reviews/:productId
// @access  Private
const createReview = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;

  // Check if user has purchased the product and order is delivered
  const order = await Order.findOne({
    customer: req.user._id,
    orderStatus: 'delivered',
    'items.product': productId
  });

  if (!order) {
    res.status(403);
    throw new Error('You can only review products you have purchased and received.');
  }

  // Check if already reviewed
  const alreadyReviewed = await Review.findOne({ user: req.user._id, product: productId });
  if (alreadyReviewed) {
    res.status(400);
    throw new Error('Product already reviewed');
  }

  const safeComment = stripHtml(comment).slice(0, 2000);
  const safeRating = Math.min(5, Math.max(1, Number(rating) || 1));

  if (!safeComment) {
    res.status(400);
    throw new Error('Review comment is required');
  }

  // Get user name
  const user = await User.findById(req.user._id);

  const review = new Review({
    user: req.user._id,
    product: productId,
    name: user?.name || 'Customer',
    rating: safeRating,
    comment: safeComment,
    isApproved: false
  });

  await review.save();
  await Product.findByIdAndUpdate(productId, { $push: { reviews: review._id } });

  res.status(201).json({ message: 'Review submitted successfully. It will be visible after approval.', review });
});

// @desc    Create review (guest via phone number)
// @route   POST /reviews/guest/:productId
// @access  Public
const createGuestReview = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { rating, comment, phone } = req.body;

  if (!phone || !phone.trim()) {
    res.status(400);
    throw new Error('Phone number is required');
  }

  const cleanPhone = phone.trim();

  // Find an order with this phone number that contains the product and is delivered
  const order = await Order.findOne({
    'shippingAddress.phone': cleanPhone,
    orderStatus: 'delivered',
    'items.product': productId
  });

  if (!order) {
    res.status(403);
    throw new Error('No delivered order found with this phone number for this product.');
  }

  // Check if this phone already reviewed this product
  const alreadyReviewed = await Review.findOne({ phone: cleanPhone, product: productId });
  if (alreadyReviewed) {
    res.status(400);
    throw new Error('You have already reviewed this product');
  }

  const safeComment = stripHtml(comment).slice(0, 2000);
  const safeRating = Math.min(5, Math.max(1, Number(rating) || 1));

  if (!safeComment) {
    res.status(400);
    throw new Error('Review comment is required');
  }

  const reviewerName = order.shippingAddress.fullName || 'Customer';

  const review = new Review({
    product: productId,
    name: reviewerName,
    phone: cleanPhone,
    rating: safeRating,
    comment: safeComment,
    isApproved: false
  });

  await review.save();
  await Product.findByIdAndUpdate(productId, { $push: { reviews: review._id } });

  res.status(201).json({
    message: 'Review submitted successfully. It will be visible after approval.',
    review,
    reviewerName
  });
});

// @desc    Create review (admin - any name, any product)
// @route   POST /reviews/admin
// @access  Private/Admin
const adminCreateReview = asyncHandler(async (req, res) => {
  const { product, name, rating, comment } = req.body;

  if (!product || !name?.trim() || !rating) {
    res.status(400);
    throw new Error('Product, name, and rating are required');
  }

  const safeComment = stripHtml(comment).slice(0, 2000);
  const safeRating = Math.min(5, Math.max(1, Number(rating) || 1));

  const review = new Review({
    product,
    name: name.trim(),
    rating: safeRating,
    comment: safeComment,
    isApproved: true // Admin reviews are auto-approved
  });

  await review.save();
  await Product.findByIdAndUpdate(product, { $push: { reviews: review._id } });

  // Recalculate ratings since admin reviews are auto-approved
  await recalcRatings(product);

  res.status(201).json({ message: 'Review created successfully', review });
});

// @desc    Get all reviews (admin)
// @route   GET /reviews
// @access  Private/Admin
const getAllReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({})
    .populate('user', 'name email')
    .populate('product', 'name images')
    .sort('-createdAt');
  
  res.json(reviews);
});

// @desc    Approve or reject a review
// @route   PUT /reviews/:id/approve
// @access  Private/Admin
const approveReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Support both approve and reject
  const shouldApprove = req.body.isApproved !== undefined ? req.body.isApproved : true;
  review.isApproved = shouldApprove;
  await review.save();

  // Recalculate average rating and count
  await recalcRatings(review.product);

  res.json({ message: shouldApprove ? 'Review approved' : 'Review rejected', review });
});

// @desc    Delete a review
// @route   DELETE /reviews/:id
// @access  Private/Admin
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Remove review reference from product
  await Product.findByIdAndUpdate(review.product, { $pull: { reviews: review._id } });

  await review.deleteOne();

  // Recalculate ratings
  await recalcRatings(review.product);

  res.json({ message: 'Review deleted' });
});

module.exports = {
  createReview,
  createGuestReview,
  adminCreateReview,
  getAllReviews,
  approveReview,
  deleteReview
};
