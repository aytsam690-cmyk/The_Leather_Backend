const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  variant: {
    size: String,
    color: String
  }
});

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  note: { type: String }
});

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  customer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: false 
  },
  isGuest: { type: Boolean, default: false },
  items: [orderItemSchema],
  shippingAddress: {
    fullName:   { type: String, required: true },
    email:      { type: String },
    phone:      { type: String, required: true },
    address1:   { type: String, required: true },
    address2:   { type: String },
    city:       { type: String, required: true },
    state:      { type: String, required: true },
    zip:        { type: String, required: true },
    country:    { type: String, required: true }
  },
  orderStatus: { 
    type: String, 
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending'
  },
  paymentMethod: { type: String, default: 'Cash on Delivery' },
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  subtotal: { type: Number, required: true },
  shippingCost: { type: Number, required: true, default: 0 },
  discount: { type: Number, required: true, default: 0 },
  couponCode: { type: String },
  total: { type: Number, required: true },
  notes: { type: String },
  adminNotes: { type: String },
  trackingId: { type: String, default: '' },
  statusHistory: [statusHistorySchema]
}, {
  timestamps: true
});

orderSchema.pre('validate', function() {
  if (!this.orderNumber) {
    const crypto = require('crypto');
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    this.orderNumber = `ORD-${timestamp}-${random}`;
  }
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
