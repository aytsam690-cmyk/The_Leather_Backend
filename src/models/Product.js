const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  size: { type: String },
  color: { type: String },
  price: { type: Number, required: true },
  stock: { type: Number, required: true, default: 0 }
});

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  alt: { type: String },
  isPrimary: { type: Boolean, default: false }
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  shortDescription: { type: String },
  category: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category',
    required: false   // optional — products can exist without a category
  },
  brand: { type: String },
  SKU: { type: String, required: true, unique: true },
  price: { type: Number, required: true },
  comparePrice: { type: Number },
  stock: { type: Number, required: true, default: 0 },
  lowStockAlert: { type: Number, default: 5 },
  images: [imageSchema],
  variants: [variantSchema],
  tags: [{ type: String }],
  isFeatured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  metaTitle: { type: String },
  metaDescription: { type: String },
  metaKeywords: { type: String },
  ratings: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  },
  reviews: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review'
  }]
}, {
  timestamps: true
});

productSchema.index({
  name: 'text',
  description: 'text',
  tags: 'text'
});

// Performance indexes for common queries
productSchema.index({ isActive: 1, category: 1 });
productSchema.index({ isActive: 1, isFeatured: 1 });
productSchema.index({ isActive: 1, price: 1 });
productSchema.index({ slug: 1 });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
