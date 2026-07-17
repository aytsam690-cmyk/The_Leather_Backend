const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const { upload } = require('../middleware/uploadMiddleware');
const { uploadImage } = require('../controllers/uploadController');
const { dynamicMemCache, invalidateByPrefix } = require('../middleware/cache');
const {
  // public
  getPosts,
  getPostBySlug,
  getPublicCategories,
  getPublicTags,
  // admin posts
  adminGetPosts,
  adminGetPost,
  createPost,
  updatePost,
  deletePost,
  // admin categories
  adminGetCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  // admin tags
  adminGetTags,
  createTag,
  updateTag,
  deleteTag,
} = require('../controllers/blogController');

// Bust every cached blog list/detail key on any write.
const bust = (req, res, next) => { invalidateByPrefix('blog'); next(); };

// ─── PUBLIC ROUTES ───────────────────────────────────────────────────────────
router.get('/categories', getPublicCategories);
router.get('/tags', getPublicTags);
router.get('/posts', dynamicMemCache('blog:posts'), getPosts);

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────
// Declared before the public "/posts/:slug" so these fixed paths win.
router.get('/admin/posts', protect, admin, adminGetPosts);
router.get('/admin/posts/:id', protect, admin, adminGetPost);
router.post('/admin/posts', protect, admin, bust, createPost);
router.put('/admin/posts/:id', protect, admin, bust, updatePost);
router.delete('/admin/posts/:id', protect, admin, bust, deletePost);

router.get('/admin/categories', protect, admin, adminGetCategories);
router.post('/admin/categories', protect, admin, bust, createCategory);
router.put('/admin/categories/:id', protect, admin, bust, updateCategory);
router.delete('/admin/categories/:id', protect, admin, bust, deleteCategory);

router.get('/admin/tags', protect, admin, adminGetTags);
router.post('/admin/tags', protect, admin, bust, createTag);
router.put('/admin/tags/:id', protect, admin, bust, updateTag);
router.delete('/admin/tags/:id', protect, admin, bust, deleteTag);

router.post('/admin/upload', protect, admin, upload.single('image'), uploadImage);

// Public single-post — LAST, so its :slug param doesn't swallow fixed paths above.
router.get('/posts/:slug', getPostBySlug);

module.exports = router;
