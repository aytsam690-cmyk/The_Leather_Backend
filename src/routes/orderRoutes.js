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
// TESTING: Rate limiters temporarily commented out for load testing
// const rateLimit = require('express-rate-limit');
// const trackLimiter = rateLimit({...});
// const orderLimiter = rateLimit({...});

// Public Routes
router.get('/track/:orderNumber', trackOrder);
router.get('/track-by-phone/:phone', trackOrdersByPhone);

// Customer Routes
router.post('/place', optionalProtect, placeOrder);
router.get('/my-orders', protect, getMyOrders);
router.get('/:orderNumber', optionalProtect, getOrderDetails);
router.put('/:id/cancel', protect, cancelOrder);

// Admin Routes
router.get('/', protect, admin, getAllOrders);
router.put('/:id/status', protect, admin, updateOrderStatus);
router.put('/:id/tracking-id', protect, admin, assignTrackingId);
router.delete('/:id', protect, admin, deleteOrder);

module.exports = router;
