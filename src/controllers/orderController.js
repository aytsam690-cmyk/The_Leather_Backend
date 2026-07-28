const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const Settings = require('../models/Settings');
const { sendOrderConfirmationEmail, sendOrderStatusEmail, sendLowStockAlertEmail, sendNewOrderAdminNotification, sendTrackingEmail } = require('../utils/emailService');
const { ensureString } = require('../utils/sanitize');

// @desc    Place a new order
// @route   POST /api/orders/place
// @access  Private
const placeOrder = asyncHandler(async (req, res) => {
  const { items, shippingAddress, paymentMethod, subtotal, shippingCost, discount, total, notes, couponCode } = req.body;

  if (!items || items.length === 0) {
    res.status(400);
    throw new Error('No order items');
  }

  // Validate items and use server-side prices
  const validatedItems = [];
  let serverSubtotal = 0;

  for (let item of items) {
    // Atomic stock deduction — prevents overselling under concurrent load
    const product = await Product.findOneAndUpdate(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { new: true }
    );

    if (!product) {
      // Check if product exists at all or just out of stock
      const exists = await Product.findById(item.product);
      if (!exists) {
        res.status(404);
        throw new Error(`Product not found: ${item.product}`);
      }
      res.status(400);
      throw new Error(`Insufficient stock for product: ${exists.name}`);
    }

    // Use the real price from DB, not the client-sent price
    const serverPrice = product.price;
    validatedItems.push({
      product: item.product,
      quantity: item.quantity,
      price: serverPrice,
      name: product.name,
    });
    serverSubtotal += serverPrice * item.quantity;

    // Low stock alert
    if (product.lowStockAlert && product.stock < product.lowStockAlert) {
      try {
        const settings = await Settings.findOne();
        const adminEmail = settings?.contactInfo?.email || process.env.BREVO_SENDER_EMAIL;
        sendLowStockAlertEmail(adminEmail, product).catch(() => {});
      } catch (_) {}
    }
  }

  // Re-validate coupon server-side
  let validatedDiscount = 0;
  if (couponCode) {
    const safeCouponCode = ensureString(couponCode);
    try {
      const coupon = safeCouponCode
        ? await Coupon.findOne({ code: safeCouponCode.toUpperCase(), isActive: true })
        : null;
      if (coupon) {
        const now = new Date();
        const isValid = now >= coupon.validFrom && now <= coupon.validUntil;
        const withinUsageLimit = !coupon.usageLimit || coupon.usedCount < coupon.usageLimit;
        const notUsedByUser = !req.user?._id || !coupon.usedBy.some(id => id.toString() === req.user._id.toString());
        const meetsMinOrder = serverSubtotal >= coupon.minOrderAmount;

        if (isValid && withinUsageLimit && notUsedByUser && meetsMinOrder) {
          if (coupon.type === 'percentage') {
            validatedDiscount = (serverSubtotal * coupon.value) / 100;
            if (coupon.maxDiscount && validatedDiscount > coupon.maxDiscount) {
              validatedDiscount = coupon.maxDiscount;
            }
          } else {
            validatedDiscount = Math.min(coupon.value, serverSubtotal);
          }
          // Update coupon usage
          coupon.usedCount += 1;
          if (req.user?._id) coupon.usedBy.push(req.user._id);
          await coupon.save();
        }
      }
    } catch (err) {
      console.error('[Order] Coupon validation error:', err.message);
    }
  }

  // Shipping is always free
  const serverShippingCost = 0;

  const order = new Order({
    customer: req.user?._id || undefined,
    isGuest: !req.user,
    items: validatedItems,
    shippingAddress,
    paymentMethod: paymentMethod || 'Cash on Delivery',
    subtotal: serverSubtotal,
    shippingCost: serverShippingCost,
    discount: validatedDiscount,
    couponCode: couponCode || undefined,
    total: serverSubtotal - validatedDiscount + serverShippingCost,
    notes,
    statusHistory: [{ status: 'pending', note: 'Order placed successfully' }]
  });

  const createdOrder = await order.save();

  res.status(201).json(createdOrder);

  // ── Send emails (non-blocking, after response) ──
  try {
    const populatedOrder = await Order.findById(createdOrder._id).populate('items.product', 'name');
    const emailOrder = {
      orderNumber: createdOrder.orderNumber,
      items: (populatedOrder?.items || createdOrder.items).map(i => ({
        name: i.product?.name || 'Product',
        quantity: i.quantity,
        price: i.price,
      })),
      shippingAddress: createdOrder.shippingAddress,
      shippingCost: createdOrder.shippingCost,
      discount: createdOrder.discount,
      total: createdOrder.total,
      paymentMethod: createdOrder.paymentMethod,
    };

    // Send order confirmation to customer (if email provided)
    const customerEmail = req.body.shippingAddress?.email || req.user?.email;
    if (customerEmail) {
      sendOrderConfirmationEmail(customerEmail, emailOrder).catch(() => {});
    }

    // Send admin notification
    const settings = await Settings.findOne();
    const adminEmail = settings?.contactInfo?.email || process.env.BREVO_SENDER_EMAIL;
    sendNewOrderAdminNotification(adminEmail, emailOrder).catch(() => {});
  } catch (err) {
    console.error('[PlaceOrder] Email error:', err?.message || err);
  }
});

// @desc    Get logged in user orders
// @route   GET /api/orders/my-orders
// @access  Private
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ customer: req.user._id }).sort('-createdAt');
  res.json(orders);
});

// @desc    Get order by orderNumber
// @route   GET /api/orders/:orderNumber
// @access  Private
const getOrderDetails = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber })
    .populate('customer', 'name email')
    .populate('items.product', 'name images slug');

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Admin can view any order
  if (req.user && req.user.role === 'admin') {
    return res.json(order);
  }

  // Logged-in user — must own the order
  if (order.customer && req.user && order.customer._id.toString() === req.user._id.toString()) {
    return res.json(order);
  }

  // Guest order — must verify with phone number
  if (!order.customer) {
    const phone = (req.query.phone || '').replace(/\s+/g, '');
    const orderPhone = (order.shippingAddress?.phone || '').replace(/\s+/g, '');

    if (!phone) {
      res.status(400);
      throw new Error('Phone number is required to view guest orders');
    }

    if (phone === orderPhone) {
      return res.json(order);
    }

    res.status(403);
    throw new Error('Phone number does not match this order');
  }

  res.status(403);
  throw new Error('Not authorized to view this order');
});

// @desc    Cancel order (Customer)
// @route   PUT /api/orders/:id/cancel
// @access  Private
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (order.customer.toString() !== req.user._id.toString()) {
    res.status(401);
    throw new Error('Not authorized');
  }

  if (order.orderStatus !== 'pending') {
    res.status(400);
    throw new Error(`Cannot cancel order. Current status: ${order.orderStatus}`);
  }

  order.orderStatus = 'cancelled';
  order.statusHistory.push({ status: 'cancelled', note: 'Cancelled by customer' });

  for (let item of order.items) {
    const product = await Product.findById(item.product);
    if (product) {
      product.stock += item.quantity;
      await product.save();
    }
  }

  await order.save();

  // Restore coupon usage
  if (order.couponCode) {
    try {
      const updateData = { $inc: { usedCount: -1 } };
      if (req.user?._id) {
        updateData.$pull = { usedBy: req.user._id };
      }
      await Coupon.findOneAndUpdate({ code: order.couponCode.toUpperCase() }, updateData);
    } catch (_) {}
  }

  res.json({ message: 'Order cancelled successfully', order });
});

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Private/Admin
const getAllOrders = asyncHandler(async (req, res) => {
  const pageSize = Number(req.query.pageSize) || 20;
  const page = Number(req.query.page) || 1;

  const filter = {};
  if (req.query.status && req.query.status !== 'all') {
    filter.orderStatus = req.query.status;
  }
  if (req.query.search) {
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const s = escapeRegex(req.query.search);
    filter.$or = [
      { orderNumber: { $regex: s, $options: 'i' } },
      { 'shippingAddress.fullName': { $regex: s, $options: 'i' } },
      { 'shippingAddress.phone': { $regex: s, $options: 'i' } },
    ];
  }

  const total = await Order.countDocuments(filter);
  const orders = await Order.find(filter)
    .populate('customer', 'name')
    .sort('-createdAt')
    .skip(pageSize * (page - 1))
    .limit(pageSize);

  res.json({
    orders,
    page,
    pages: Math.ceil(total / pageSize),
    total,
  });
});

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  order.orderStatus = status;
  if (status === 'delivered') {
    order.paymentStatus = 'paid';
  }
  
  order.statusHistory.push({ status, note: note || `Status updated to ${status}` });

  const updatedOrder = await order.save();
  res.json(updatedOrder);

  // Send status update email to customer (non-blocking)
  const customerEmail = order.shippingAddress?.email;
  if (customerEmail) {
    sendOrderStatusEmail(customerEmail, order, status).catch(() => {});
  }
});

// @desc    Assign tracking ID to order
// @route   PUT /api/orders/:id/tracking-id
// @access  Private/Admin
const assignTrackingId = asyncHandler(async (req, res) => {
  const { trackingId } = req.body;

  if (!trackingId || trackingId.trim() === '') {
    return res.status(400).json({ success: false, message: 'Tracking ID is required' });
  }

  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { trackingId: trackingId.trim() },
    { new: true }
  );

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  // Get courier info from Settings
  const settings = await Settings.findOne();
  const trackingUrl = (settings?.courierWebsite || '') + trackingId.trim();
  const courierName = settings?.courierName || 'Our Courier Partner';

  // Send tracking email if customer email exists
  const customerEmail = order.shippingAddress?.email;
  if (customerEmail && customerEmail.trim() !== '') {
    try {
      await sendTrackingEmail({
        to: customerEmail,
        orderNumber: order.orderNumber,
        customerName: order.shippingAddress?.fullName || 'Valued Customer',
        trackingId: trackingId.trim(),
        trackingUrl,
        courierName
      });
    } catch (err) {
      console.error('[TrackingEmail] Failed:', err?.message || err);
    }
  }

  return res.json({ success: true, data: order, message: 'Tracking ID assigned successfully' });
});

// @desc    Track order by order number (public - no auth required)
// @route   GET /api/orders/track/:orderNumber
// @access  Public
const trackOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber })
    .populate('items.product', 'name images price');

  if (!order) {
    res.status(404);
    throw new Error('Order not found. Please check your order number.');
  }

  res.json(formatOrderForTracking(order));
});

// @desc    Track all orders by phone number (public - no auth required)
// @route   GET /api/orders/track-by-phone/:phone
// @access  Public
const trackOrdersByPhone = asyncHandler(async (req, res) => {
  const phone = req.params.phone.replace(/\s+/g, '');

  if (!phone || phone.length < 6) {
    res.status(400);
    throw new Error('Please enter a valid phone number.');
  }

  const orders = await Order.find({ 'shippingAddress.phone': { $regex: phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } })
    .populate('items.product', 'name images price')
    .sort('-createdAt');

  if (!orders || orders.length === 0) {
    res.status(404);
    throw new Error('No orders found for this phone number.');
  }

  res.json(orders.map(order => formatOrderForTracking(order, true)));
});

// Helper to format order for tracking response
function formatOrderForTracking(order, isPublicPhoneTrack = false) {
  return {
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    statusHistory: order.statusHistory,
    items: order.items.map(i => ({
      name: i.product?.name || 'Product',
      image: i.product?.images?.[0] || null,
      quantity: i.quantity,
      price: i.price,
      size: i.variant?.size,
      color: i.variant?.color,
    })),
    shippingAddress: {
      fullName: isPublicPhoneTrack ? '***' : order.shippingAddress?.fullName,
      phone: isPublicPhoneTrack ? '***' : order.shippingAddress?.phone,
      city: order.shippingAddress?.city,
      country: order.shippingAddress?.country,
    },
    trackingId: order.trackingId,
    courierName: order.courierName,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    discount: order.discount,
    total: order.total,
    createdAt: order.createdAt,
  };
}

// @desc    Delete an order (admin)
// @route   DELETE /api/orders/:id
// @access  Private/Admin
const deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Restore stock for non-cancelled/non-delivered orders
  if (!['cancelled', 'delivered'].includes(order.orderStatus)) {
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product) {
        product.stock += item.quantity;
        await product.save();
      }
    }
  }

  // Restore coupon usage for non-cancelled/non-delivered orders
  if (order.couponCode && !['cancelled', 'delivered'].includes(order.orderStatus)) {
    try {
      const updateData = { $inc: { usedCount: -1 } };
      if (order.customer) {
        updateData.$pull = { usedBy: order.customer };
      }
      await Coupon.findOneAndUpdate({ code: order.couponCode.toUpperCase() }, updateData);
    } catch (_) {}
  }

  await Order.findByIdAndDelete(req.params.id);
  res.json({ message: 'Order deleted successfully' });
});

module.exports = {
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
};
