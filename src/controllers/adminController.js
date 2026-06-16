const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const Review = require('../models/Review');

// @desc    Get comprehensive dashboard stats
// @route   GET /api/admin/dashboard
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
  // 1. Basic Counts
  const totalOrders = await Order.countDocuments();
  const totalCustomers = await User.countDocuments({ role: 'customer' });
  const totalProducts = await Product.countDocuments({ isActive: { $ne: false } });

  // 2. Revenue Calculation (only confirmed/processing/shipped/delivered)
  const revenueObj = await Order.aggregate([
    { $match: { orderStatus: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] } } },
    { $group: { _id: null, totalRevenue: { $sum: '$total' } } }
  ]);
  const revenue = revenueObj.length > 0 ? revenueObj[0].totalRevenue : 0;

  // 3. Recent Orders
  const recentOrders = await Order.find()
    .populate('customer', 'name email')
    .sort('-createdAt')
    .limit(5);

  // 4. Low Stock Alerts
  const lowStockProducts = await Product.find({
    $expr: { $lte: ['$stock', '$lowStockAlert'] }
  }).limit(10);

  // 5. Sales Chart Data (Last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const salesData = await Order.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo }, orderStatus: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        dailyRevenue: { $sum: '$total' },
        ordersCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.json({
    stats: { totalOrders, revenue, totalCustomers, totalProducts },
    recentOrders,
    lowStockProducts,
    salesData
  });
});

// @desc    Get all customers with their order stats
// @route   GET /api/admin/customers
// @access  Private/Admin
const getCustomers = asyncHandler(async (req, res) => {
  const customers = await User.aggregate([
    { $match: { role: 'customer' } },
    {
      $lookup: {
        from: 'orders',
        localField: '_id',
        foreignField: 'customer',
        as: 'orders'
      }
    },
    {
      $project: {
        name: 1,
        email: 1,
        phone: 1,
        isActive: 1,
        createdAt: 1,
        totalOrders: { $size: '$orders' },
        totalSpent: { $sum: '$orders.total' }
      }
    },
    { $sort: { createdAt: -1 } }
  ]);

  res.json(customers);
});

// @desc    Activate or deactivate customer account
// @route   PUT /api/admin/customers/:id/status
// @access  Private/Admin
const updateCustomerStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (user) {
    user.isActive = req.body.isActive;
    await user.save();
    res.json({ message: 'Customer status updated', isActive: user.isActive });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Hard delete a customer and their reviews
// @route   DELETE /api/admin/customers/:id
// @access  Private/Admin
const deleteCustomer = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (user) {
    if (user.role === 'admin') {
      res.status(400);
      throw new Error('Cannot delete admin users through this endpoint');
    }
    
    // Delete user's reviews to prevent orphaned records
    await Review.deleteMany({ user: user._id });
    
    // Delete the user
    await user.deleteOne();
    
    res.json({ message: 'Customer and their reviews permanently deleted' });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// --- SETTINGS CRUD ---

// @desc    Get store settings
// @route   GET /api/admin/settings
// @access  Public
const getSettings = asyncHandler(async (req, res) => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({}); // create defaults if none exist
  }
  res.json(settings);
});

// @desc    Update store settings
// @route   PUT /api/admin/settings
// @access  Private/Admin
const updateSettings = asyncHandler(async (req, res) => {
  let settings = await Settings.findOne();
  if (settings) {
    const updatedSettings = await Settings.findByIdAndUpdate(settings._id, req.body, { new: true });
    res.json(updatedSettings);
  } else {
    const newSettings = await Settings.create(req.body);
    res.json(newSettings);
  }
});

// @desc    Get sales chart data
// @route   GET /api/admin/dashboard/sales
const getSalesChart = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const data = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, orderStatus: { $ne: 'cancelled' } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  res.json(data);
});

// @desc    Get order status distribution
// @route   GET /api/admin/dashboard/order-status
const getOrderStatusChart = asyncHandler(async (req, res) => {
  const data = await Order.aggregate([
    { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
  ]);
  res.json(data);
});

// @desc    Get recent orders
// @route   GET /api/admin/dashboard/recent-orders
const getRecentOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find().populate('customer', 'name email').sort('-createdAt').limit(5);
  res.json(orders);
});

// @desc    Get low stock products
// @route   GET /api/admin/dashboard/low-stock
const getLowStockProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ $expr: { $lte: ['$stock', '$lowStockAlert'] }, isActive: true }).limit(10);
  res.json(products);
});

// @desc    Get top selling products
// @route   GET /api/admin/dashboard/top-selling
const getTopSellingProducts = asyncHandler(async (req, res) => {
  const data = await Order.aggregate([
    { $unwind: '$items' },
    { $group: { _id: '$items.product', totalSold: { $sum: '$items.quantity' }, name: { $first: '$items.name' } } },
    { $sort: { totalSold: -1 } },
    { $limit: 5 }
  ]);
  res.json(data);
});

module.exports = {
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
};
