const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const Order = require('../models/Order');
const Product = require('../models/Product');

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
  const alreadyReviewed = await Review.findOne({
    user: req.user._id,
    product: productId
  });

  if (alreadyReviewed) {
    res.status(400);
    throw new Error('Product already reviewed');
  }

  const review = new Review({
    user: req.user._id,
    product: productId,
    rating: Number(rating),
    comment,
    isApproved: false
  });

  await review.save();

  // Add review to product
  await Product.findByIdAndUpdate(productId, {
    $push: { reviews: review._id }
  });

  res.status(201).json({ message: 'Review submitted successfully. It will be visible after approval.', review });
});

const getAllReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({})
    .populate('user', 'name email')
    .populate('product', 'name images')
    .sort('-createdAt');
  
  res.json(reviews);
});

const approveReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  review.isApproved = true;
  await review.save();

  // Recalculate average rating and count
  const approvedReviews = await Review.find({
    product: review.product,
    isApproved: true
  });

  const count = approvedReviews.length;
  const average = approvedReviews.reduce((acc, item) => acc + item.rating, 0) / count;

  await Product.findByIdAndUpdate(review.product, {
    'ratings.average': average,
    'ratings.count': count
  });

  res.json({ message: 'Review approved', review });
});

module.exports = {
  createReview,
  getAllReviews,
  approveReview
};
