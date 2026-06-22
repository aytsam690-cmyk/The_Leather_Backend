const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');

// Guest review (no auth)
router.post('/guest/:productId', reviewController.createGuestReview);

// Admin create review
router.post('/admin', protect, admin, reviewController.adminCreateReview);

// Logged-in user review
router.post('/:productId', protect, reviewController.createReview);

// Admin: get all reviews
router.get('/', protect, admin, reviewController.getAllReviews);

// Admin: approve/reject review
router.put('/:id/approve', protect, admin, reviewController.approveReview);

// Admin: delete review
router.delete('/:id', protect, admin, reviewController.deleteReview);

module.exports = router;
