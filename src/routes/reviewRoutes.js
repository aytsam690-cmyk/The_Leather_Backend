const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');

router.post('/:productId', protect, reviewController.createReview);
router.get('/', protect, admin, reviewController.getAllReviews);
router.put('/:id/approve', protect, admin, reviewController.approveReview);

module.exports = router;
