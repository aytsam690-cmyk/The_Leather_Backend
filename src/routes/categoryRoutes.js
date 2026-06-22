const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const {
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');
const { memCache, invalidateCache } = require('../middleware/cache');

router.get('/', memCache('categories'), getCategories);
router.get('/:slug', getCategoryBySlug);

// Admin Routes — invalidate cache on changes
const bust = (req, res, next) => { invalidateCache('categories'); next(); };
router.post('/', protect, admin, bust, createCategory);
router.put('/:id', protect, admin, bust, updateCategory);
router.delete('/:id', protect, admin, bust, deleteCategory);

module.exports = router;
