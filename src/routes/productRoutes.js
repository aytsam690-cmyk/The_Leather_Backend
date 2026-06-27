const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const {
  getProducts,
  getProductBySlug,
  getFeaturedProducts,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductReview
} = require('../controllers/productController');
const { memCache, dynamicMemCache, invalidateByPrefix } = require('../middleware/cache');

// Bust all product-related caches when admin modifies products
const bustProducts = (req, res, next) => { invalidateByPrefix('products', 'featured', 'filters'); next(); };

// Note: Order matters! Specific routes before parameter routes
router.get('/featured', memCache('featured-products', 5 * 60 * 1000), getFeaturedProducts);
router.get('/search', searchProducts);
router.get('/', dynamicMemCache('products', 2 * 60 * 1000), getProducts);
router.get('/:slug', getProductBySlug);

// Admin Routes — invalidate product caches on changes
router.post('/', protect, admin, bustProducts, createProduct);
router.put('/:id', protect, admin, bustProducts, updateProduct);
router.delete('/:id', protect, admin, bustProducts, deleteProduct);

// Customer Routes removed and moved to reviewRoutes.js

module.exports = router;
