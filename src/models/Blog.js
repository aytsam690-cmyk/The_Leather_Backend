const mongoose = require('mongoose');

// Generate a URL-safe slug from a string
const slugify = (str) =>
  String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

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
  metaTitle: {
    type: String,
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

// Auto-generate a slug from the title when one isn't provided.
// Ensures uniqueness by appending a short counter on collision.
blogSchema.pre('validate', async function (next) {
  if (!this.slug && this.title) {
    this.slug = slugify(this.title);
  } else if (this.slug) {
    this.slug = slugify(this.slug);
  }

  if (this.slug && (this.isNew || this.isModified('slug'))) {
    const base = this.slug;
    let candidate = base;
    let counter = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await this.constructor.findOne({ slug: candidate, _id: { $ne: this._id } })) {
      candidate = `${base}-${counter++}`;
    }
    this.slug = candidate;
  }

  next();
});

blogSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Blog', blogSchema);
