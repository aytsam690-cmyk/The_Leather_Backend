// BLOG FEATURE — PATCH 2 — ROUTES
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const { upload } = require('../middleware/uploadMiddleware');
const { uploadImage } = require('../controllers/uploadController');
const blogController = require('../controllers/blogController');

// --- PUBLIC ROUTES ---
router.get('/blog', blogController.getPosts);
router.get('/blog/featured', blogController.getFeaturedPost);
router.get('/blog/categories', blogController.getCategories);
router.get('/blog/category/:slug', blogController.getPostsByCategory);
router.get('/blog/:slug', blogController.getPostBySlug);
router.post('/blog/newsletter', blogController.subscribeNewsletter);

// --- ADMIN ROUTES ---
router.get('/admin/blog', protect, admin, blogController.adminGetPosts);
router.post('/admin/blog', protect, admin, blogController.createPost);
router.put('/admin/blog/:id', protect, admin, blogController.updatePost);
router.delete('/admin/blog/:id', protect, admin, blogController.deletePost);
router.patch('/admin/blog/:id/status', protect, admin, blogController.updatePostStatus);
router.patch('/admin/blog/:id/pin', protect, admin, blogController.togglePostPin);

router.post('/admin/blog/categories', protect, admin, blogController.createCategory);
router.put('/admin/blog/categories/:id', protect, admin, blogController.updateCategory);
router.delete('/admin/blog/categories/:id', protect, admin, blogController.deleteCategory);

router.post('/admin/blog/upload-image', protect, admin, upload.single('image'), uploadImage);
router.get('/admin/blog/products/search', protect, admin, blogController.searchBlogProducts);

router.get('/admin/blog/subscribers', protect, admin, blogController.getSubscribers);
router.get('/admin/blog/subscribers/export', protect, admin, blogController.exportSubscribers);

module.exports = router;
