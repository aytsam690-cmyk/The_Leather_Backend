const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper: strip HTML tags
const stripHtml = (str) => String(str || '').replace(/<[^>]*>/g, '').trim();

// Helper: recalculate product ratings
const recalcRatings = async (productId) => {
  const approvedReviews = await Review.find({ product: productId, isApproved: true });
  const count = approvedReviews.length;
  const average = count > 0 ? approvedReviews.reduce((acc, r) => acc + r.rating, 0) / count : 0;
  await Product.findByIdAndUpdate(productId, { 'ratings.average': average, 'ratings.count': count });
};

const uploadImagesToCloudinary = async (files) => {
  if (!files || files.length === 0) return [];
  const uploadPromises = files.map(file => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(file.path, {
        folder: 'shopverse/reviews',
        transformation: [
          { width: 800, height: 800, crop: 'limit' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      })
      .then(result => resolve({ url: result.secure_url, publicId: result.public_id, path: file.path }))
      .catch(err => reject(err));
    });
  });

  try {
    const results = await Promise.all(uploadPromises);
    for (const res of results) {
       fs.unlink(res.path, err => { if (err) console.error('Failed to delete temp file:', err.message); });
    }
    return results.map(r => ({ url: r.url, publicId: r.publicId }));
  } catch (err) {
    for (const file of files) {
       fs.unlink(file.path, () => {});
    }
    throw new Error('Image upload failed: ' + err.message);
  }
};

// @desc    Create review (logged-in user)
// @route   POST /reviews/:productId
// @access  Private
const createReview = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;

  const order = await Order.findOne({
    customer: req.user._id,
    orderStatus: 'delivered',
    'items.product': productId
  });

  if (!order) {
    if (req.files) req.files.forEach(f => fs.unlink(f.path, ()=>{}));
    res.status(403);
    throw new Error('You can only review products you have purchased and received.');
  }

  const alreadyReviewed = await Review.findOne({ user: req.user._id, product: productId });
  if (alreadyReviewed) {
    if (req.files) req.files.forEach(f => fs.unlink(f.path, ()=>{}));
    res.status(400);
    throw new Error('Product already reviewed');
  }

  const safeComment = stripHtml(comment).slice(0, 2000);
  const safeRating = Math.min(5, Math.max(1, Number(rating) || 1));

  if (!safeComment) {
    if (req.files) req.files.forEach(f => fs.unlink(f.path, ()=>{}));
    res.status(400);
    throw new Error('Review comment is required');
  }

  const uploadedImages = await uploadImagesToCloudinary(req.files);
  const user = await User.findById(req.user._id);

  const review = new Review({
    user: req.user._id,
    product: productId,
    name: user?.name || 'Customer',
    rating: safeRating,
    comment: safeComment,
    images: uploadedImages,
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
    if (req.files) req.files.forEach(f => fs.unlink(f.path, ()=>{}));
    res.status(400);
    throw new Error('Phone number is required');
  }

  const cleanPhone = phone.trim();

  const order = await Order.findOne({
    'shippingAddress.phone': cleanPhone,
    orderStatus: 'delivered',
    'items.product': productId
  });

  if (!order) {
    if (req.files) req.files.forEach(f => fs.unlink(f.path, ()=>{}));
    res.status(403);
    throw new Error('No delivered order found with this phone number for this product.');
  }

  const alreadyReviewed = await Review.findOne({ phone: cleanPhone, product: productId });
  if (alreadyReviewed) {
    if (req.files) req.files.forEach(f => fs.unlink(f.path, ()=>{}));
    res.status(400);
    throw new Error('You have already reviewed this product');
  }

  const safeComment = stripHtml(comment).slice(0, 2000);
  const safeRating = Math.min(5, Math.max(1, Number(rating) || 1));

  if (!safeComment) {
    if (req.files) req.files.forEach(f => fs.unlink(f.path, ()=>{}));
    res.status(400);
    throw new Error('Review comment is required');
  }

  const uploadedImages = await uploadImagesToCloudinary(req.files);
  const reviewerName = order.shippingAddress.fullName || 'Customer';

  const review = new Review({
    product: productId,
    name: reviewerName,
    phone: cleanPhone,
    rating: safeRating,
    comment: safeComment,
    images: uploadedImages,
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
  const { product, name, rating, comment, isFeatured } = req.body;

  if (!product || !name?.trim() || !rating) {
    if (req.files) req.files.forEach(f => fs.unlink(f.path, ()=>{}));
    res.status(400);
    throw new Error('Product, name, and rating are required');
  }

  const safeComment = stripHtml(comment).slice(0, 2000);
  const safeRating = Math.min(5, Math.max(1, Number(rating) || 1));
  const uploadedImages = await uploadImagesToCloudinary(req.files);

  const review = new Review({
    product,
    name: name.trim(),
    rating: safeRating,
    comment: safeComment,
    images: uploadedImages,
    isFeatured: isFeatured === 'true' || isFeatured === true,
    isApproved: true // Admin reviews are auto-approved
  });

  await review.save();
  await Product.findByIdAndUpdate(product, { $push: { reviews: review._id } });
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

// @desc    Get featured reviews for homepage
// @route   GET /reviews/featured
// @access  Public
const getFeaturedReviews = asyncHandler(async (req, res) => {
  let reviews = await Review.find({ isFeatured: true, isApproved: true })
    .populate('product', 'name images slug')
    .sort('-createdAt')
    .limit(10);
  
  if (reviews.length === 0) {
    // Fallback: get recent reviews with images
    reviews = await Review.find({ 
      isApproved: true,
      $expr: { $gt: [{ $size: { $ifNull: ["$images", []] } }, 0] }
    })
    .populate('product', 'name images slug')
    .sort('-createdAt')
    .limit(10);
  }

  res.json(reviews);
});

// @desc    Edit a review (admin)
// @route   PUT /reviews/:id
// @access  Private/Admin
const editReview = asyncHandler(async (req, res) => {
  const { name, rating, comment, isFeatured, imagesToRemove } = req.body;
  const review = await Review.findById(req.params.id);

  if (!review) {
    if (req.files) req.files.forEach(f => fs.unlink(f.path, ()=>{}));
    res.status(404);
    throw new Error('Review not found');
  }

  if (name) review.name = name.trim();
  if (rating) review.rating = Math.min(5, Math.max(1, Number(rating) || 1));
  if (comment) review.comment = stripHtml(comment).slice(0, 2000);
  if (isFeatured !== undefined) review.isFeatured = isFeatured === 'true' || isFeatured === true;

  // Handle removed images
  if (imagesToRemove) {
    const toRemove = Array.isArray(imagesToRemove) ? imagesToRemove : [imagesToRemove];
    for (const pubId of toRemove) {
      if (pubId) {
        try {
          await cloudinary.uploader.destroy(pubId);
        } catch (err) {
          console.error('Failed to destroy image:', pubId, err);
        }
        review.images = review.images.filter(img => img.publicId !== pubId);
      }
    }
  }

  // Handle new images
  if (req.files && req.files.length > 0) {
    const newImages = await uploadImagesToCloudinary(req.files);
    review.images = [...(review.images || []), ...newImages];
  }

  await review.save();
  await recalcRatings(review.product);

  res.json({ message: 'Review updated successfully', review });
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

  const shouldApprove = req.body.isApproved !== undefined ? req.body.isApproved : true;
  review.isApproved = shouldApprove;
  await review.save();

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

  // Delete all images from Cloudinary
  if (review.images && review.images.length > 0) {
    for (const img of review.images) {
      if (img.publicId) {
        try {
          await cloudinary.uploader.destroy(img.publicId);
        } catch (err) {
          console.error('Failed to destroy image on delete review:', img.publicId, err);
        }
      }
    }
  }

  await Product.findByIdAndUpdate(review.product, { $pull: { reviews: review._id } });
  await review.deleteOne();
  await recalcRatings(review.product);

  res.json({ message: 'Review deleted' });
});

module.exports = {
  createReview,
  createGuestReview,
  adminCreateReview,
  getAllReviews,
  getFeaturedReviews,
  editReview,
  approveReview,
  deleteReview
};
