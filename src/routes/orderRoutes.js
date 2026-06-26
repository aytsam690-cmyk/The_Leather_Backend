const express = require('express');
const router = express.Router();
const { protect, optionalProtect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const {
  placeOrder,
  getMyOrders,
  getOrderDetails,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
  assignTrackingId,
  trackOrder,
  trackOrdersByPhone,
  deleteOrder
} = require('../controllers/orderController');
const rateLimit = require('express-rate-limit');

const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: 'Too many tracking requests. Try again later.' }
});

const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: 'Too many orders placed. Please try again later.' }
});

// Public Routes
router.get('/track/:orderNumber', trackLimiter, trackOrder);
router.get('/track-by-phone/:phone', trackLimiter, trackOrdersByPhone);

// Customer Routes
router.post('/place', optionalProtect, orderLimiter, placeOrder);
router.get('/my-orders', protect, getMyOrders);
router.get('/:orderNumber', optionalProtect, getOrderDetails);
router.put('/:id/cancel', protect, cancelOrder);

// Admin Routes
router.get('/', protect, admin, getAllOrders);
router.put('/:id/status', protect, admin, updateOrderStatus);
router.put('/:id/tracking-id', protect, admin, assignTrackingId);
router.delete('/:id', protect, admin, deleteOrder);

module.exports = router;
