const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Blog title is required'],
    trim: true,
  },
  slug: {
    type: String,
    required: [true, 'Slug is required'],
    unique: true,
    trim: true,
  },
  metaDescription: {
    type: String,
    trim: true,
  },
  content: {
    type: String,
    required: [true, 'Blog content (HTML) is required'],
  },
  coverImage: {
    type: String,
  },
  relatedProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true
});

module.exports = mongoose.model('Blog', blogSchema);
