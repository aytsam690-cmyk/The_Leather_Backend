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

// Note: Order matters! Specific routes before parameter routes
router.get('/featured', getFeaturedProducts);
router.get('/search', searchProducts);
router.get('/', getProducts);
router.get('/:slug', getProductBySlug);

// Admin Routes
router.post('/', protect, admin, createProduct);
router.put('/:id', protect, admin, updateProduct);
router.delete('/:id', protect, admin, deleteProduct);

// Customer Routes removed and moved to reviewRoutes.js

module.exports = router;
