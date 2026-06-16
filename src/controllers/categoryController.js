const asyncHandler = require('express-async-handler');
const Category = require('../models/Category');
const { deleteImageFromCloudinary } = require('../utils/cloudinaryUtils');
const Product = require('../models/Product');

// @desc    Get all categories with product count
// @route   GET /api/categories
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort('order');
  
  // Aggregate to get product counts per category
  const productCounts = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]);

  const categoriesWithCounts = categories.map(cat => {
    const pCount = productCounts.find(p => p._id && p._id.toString() === cat._id.toString());
    return {
      ...cat._doc,
      productCount: pCount ? pCount.count : 0
    };
  });

  res.json(categoriesWithCounts);
});

// @desc    Get category by slug with its products
// @route   GET /api/categories/:slug
// @access  Public
const getCategoryBySlug = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ slug: req.params.slug, isActive: true });
  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  const products = await Product.find({ category: category._id, isActive: true });
  
  res.json({ category, products });
});

// @desc    Create a category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create(req.body);
  res.status(201).json(category);
});

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (category) {
    res.json(category);
  } else {
    res.status(404);
    throw new Error('Category not found');
  }
});

// @desc    Hard delete a category and its image
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (category) {
    if (category.image) {
      await deleteImageFromCloudinary(category.image);
    }
    
    await category.deleteOne();
    res.json({ message: 'Category and associated image removed' });
  } else {
    res.status(404);
    throw new Error('Category not found');
  }
});

module.exports = {
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory
};
