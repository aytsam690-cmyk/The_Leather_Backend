const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const { upload } = require('../middleware/uploadMiddleware');
const rateLimit = require('express-rate-limit');

const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Too many reviews submitted. Please try again later.' }
});

// Featured reviews (public)
router.get('/featured', reviewController.getFeaturedReviews);

// Guest review (no auth)
router.post('/guest/:productId', reviewLimiter, upload.array('images', 3), reviewController.createGuestReview);

// Admin create review
router.post('/admin', protect, admin, upload.array('images', 3), reviewController.adminCreateReview);

// Logged-in user review
router.post('/:productId', protect, upload.array('images', 3), reviewController.createReview);

// Admin: get all reviews
router.get('/', protect, admin, reviewController.getAllReviews);

// Admin: edit review
router.put('/:id', protect, admin, upload.array('images', 3), reviewController.editReview);

// Admin: approve/reject review
router.put('/:id/approve', protect, admin, reviewController.approveReview);

// Admin: delete review
router.delete('/:id', protect, admin, reviewController.deleteReview);

module.exports = router;
