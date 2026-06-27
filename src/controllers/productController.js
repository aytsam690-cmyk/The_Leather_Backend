const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const { deleteImageFromCloudinary } = require('../utils/cloudinaryUtils');
const Review = require('../models/Review');

// @desc    Fetch all products with filters, sorting, pagination
// @route   GET /api/products
// @access  Public
const getProducts = asyncHandler(async (req, res) => {
  const pageSize = Number(req.query.pageSize) || 10;
  const page = Number(req.query.page) || 1;

  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const keyword = req.query.keyword
    ? { name: { $regex: escapeRegex(req.query.keyword), $options: 'i' } }
    : {};

  const filter = { isActive: true, ...keyword };

  if (req.query.category) filter.category = req.query.category;
  if (req.query.brand) filter.brand = req.query.brand;
  if (req.query.inStock === 'true') filter.stock = { $gt: 0 };
  
  if (req.query.minPrice || req.query.maxPrice) {
    filter.price = {};
    if (req.query.minPrice) filter.price.$gte = Number(req.query.minPrice);
    if (req.query.maxPrice) filter.price.$lte = Number(req.query.maxPrice);
  }

  if (req.query.minRating) filter['ratings.average'] = { $gte: Number(req.query.minRating) };

  let sortCriteria = {};
  switch (req.query.sort) {
    case 'price_asc': sortCriteria = { price: 1 }; break;
    case 'price_desc': sortCriteria = { price: -1 }; break;
    case 'popular': sortCriteria = { 'ratings.count': -1 }; break;
    case 'newest': sortCriteria = { createdAt: -1 }; break;
    default: sortCriteria = { createdAt: -1 };
  }

  const count = await Product.countDocuments(filter);
  const products = await Product.find(filter)
    .populate('category', 'name slug')
    .sort(sortCriteria)
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .lean();

  res.json({ products, page, pages: Math.ceil(count / pageSize), total: count });
});

// @desc    Fetch single product by slug or ID and related products
// @route   GET /api/products/:slug
// @access  Public
const getProductBySlug = asyncHandler(async (req, res) => {
  const param = req.params.slug;
  
  // Try by slug first, then by _id
  let product = await Product.findOne({ slug: param, isActive: true })
    .populate('category', 'name slug')
    .populate({
      path: 'reviews',
      match: { isApproved: true },
      populate: { path: 'user', select: 'name' }
    })
    .lean();

  if (!product && param.match(/^[0-9a-fA-F]{24}$/)) {
    product = await Product.findOne({ _id: param, isActive: true })
      .populate('category', 'name slug')
      .populate({
        path: 'reviews',
        match: { isApproved: true },
        populate: { path: 'user', select: 'name' }
      })
      .lean();
  }

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Fetch related products
  const relatedFilter = { _id: { $ne: product._id }, isActive: true };
  if (product.category) relatedFilter.category = product.category._id || product.category;
  const relatedProducts = await Product.find(relatedFilter).limit(4).lean();

  res.json({ product, relatedProducts });
});

// @desc    Get featured products (or latest if none featured)
// @route   GET /api/products/featured
// @access  Public
const getFeaturedProducts = asyncHandler(async (req, res) => {
  let products = await Product.find({ isFeatured: true, isActive: true }).limit(8).lean();
  // If no products are marked as featured, return the latest products instead
  if (products.length === 0) {
    products = await Product.find({ isActive: true }).sort({ createdAt: -1 }).limit(8).lean();
  }
  res.json(products);
});

// @desc    Search products
// @route   GET /api/products/search
// @access  Public
const searchProducts = asyncHandler(async (req, res) => {
  const q = req.query.q || '';
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const products = await Product.find({
    isActive: true,
    name: { $regex: escapeRegex(typeof q === 'string' ? q : ''), $options: 'i' }
  }).limit(10).lean();
  res.json(products);
});

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = asyncHandler(async (req, res) => {
  const product = new Product(req.body);
  const createdProduct = await product.save();
  res.status(201).json(createdProduct);
});

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (product) {
    res.json(product);
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc    Hard delete a product and its images
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (product) {
    // Delete all images from Cloudinary
    if (product.images && product.images.length > 0) {
      for (const img of product.images) {
        if (img.url) {
          await deleteImageFromCloudinary(img.url);
        }
      }
    }
    
    await product.deleteOne();
    res.json({ message: 'Product and associated images removed' });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc    Create new review
// @route   POST /api/products/:id/review
// @access  Private
const createProductReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const product = await Product.findById(req.params.id);

  if (product) {
    const alreadyReviewed = await Review.findOne({ product: product._id, user: req.user._id });
    if (alreadyReviewed) {
      res.status(400);
      throw new Error('Product already reviewed');
    }

    const review = await Review.create({
      product: product._id,
      user: req.user._id,
      rating: Number(rating),
      comment,
      isApproved: false // Requires admin approval
    });

    product.reviews.push(review._id);
    
    // Note: Ratings average will be recalculated when the review is approved by an admin
    await product.save();

    res.status(201).json({ message: 'Review added and pending approval' });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

module.exports = {
  getProducts,
  getProductBySlug,
  getFeaturedProducts,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductReview
};
