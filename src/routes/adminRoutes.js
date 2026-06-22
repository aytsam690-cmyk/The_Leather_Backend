const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const {
  getDashboardStats,
  getSalesChart,
  getOrderStatusChart,
  getRecentOrders,
  getLowStockProducts,
  getTopSellingProducts,
  getCustomers,
  updateCustomerStatus,
  deleteCustomer,
  getSettings,
  updateSettings
} = require('../controllers/adminController');
const { invalidateCache } = require('../middleware/cache');

router.use(protect, admin); // Apply to all admin routes

router.get('/dashboard', getDashboardStats);
router.get('/dashboard/sales', getSalesChart);
router.get('/dashboard/order-status', getOrderStatusChart);
router.get('/dashboard/recent-orders', getRecentOrders);
router.get('/dashboard/low-stock', getLowStockProducts);
router.get('/dashboard/top-selling', getTopSellingProducts);

router.get('/customers', getCustomers);
router.put('/customers/:id/status', updateCustomerStatus);
router.delete('/customers/:id', deleteCustomer);

router.get('/settings', getSettings);
router.put('/settings', (req, res, next) => { invalidateCache('settings'); next(); }, updateSettings);

module.exports = router;
