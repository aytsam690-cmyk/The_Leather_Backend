const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { ensureString } = require('../utils/sanitize');

// Escape regex special chars to prevent ReDoS
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const searchProducts = asyncHandler(async (req, res) => {
  const query = ensureString(req.query.q) || '';
  
  if (!query) {
    return res.json({ products: [], suggestions: { categories: [], brands: [] } });
  }

  // Text search
  let products = await Product.find({
    $text: { $search: query },
    isActive: true
  }).populate('category');

  // Fallback to regex if no results from text search
  if (products.length === 0) {
    const regex = new RegExp(escapeRegex(query), 'i');
    products = await Product.find({
      $or: [
        { name: regex },
        { description: regex },
        { tags: regex }
      ],
      isActive: true
    }).populate('category');
  }

  // Get suggestions from the found products
  const categoryIds = [...new Set(products.map(p => p.category?._id).filter(Boolean))];
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];

  const categories = await Category.find({ _id: { $in: categoryIds } });

  res.json({
    products,
    suggestions: {
      categories,
      brands
    }
  });
});

const getSuggestions = asyncHandler(async (req, res) => {
  const query = ensureString(req.query.q) || '';
  
  if (!query) {
    return res.json({ products: [], categories: [] });
  }

  const regex = new RegExp(escapeRegex(query), 'i');

  const products = await Product.find({ name: regex, isActive: true })
    .select('name')
    .limit(5);

  const categories = await Category.find({ name: regex }).limit(5);

  res.json({
    products,
    categories
  });
});

module.exports = {
  searchProducts,
  getSuggestions
};
