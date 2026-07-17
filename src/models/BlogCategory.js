const mongoose = require('mongoose');

// URL-safe slug from a string
const slugify = (str) =>
  String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const blogCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
}, {
  timestamps: true,
});

// Auto-generate a unique slug from name (or a provided slug), respecting edits.
blogCategorySchema.pre('validate', async function (next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name);
  } else if (this.slug) {
    this.slug = slugify(this.slug);
  }

  if (this.slug && (this.isNew || this.isModified('slug'))) {
    const base = this.slug || 'category';
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

module.exports = mongoose.model('BlogCategory', blogCategorySchema);
