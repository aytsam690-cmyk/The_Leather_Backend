const mongoose = require('mongoose');

// URL-safe slug from a string
const slugify = (str) =>
  String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const blogPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Post title is required'],
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    trim: true,
  },
  content: {
    type: String,
    required: [true, 'Post content (HTML) is required'],
  },
  excerpt: {
    type: String,
    trim: true,
  },
  featuredImage: {
    type: String,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogCategory',
  },
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogTag',
  }],
  status: {
    type: String,
    enum: ['draft', 'published', 'scheduled'],
    default: 'draft',
  },
  publishedAt: {
    type: Date,
  },

  // ─── SEO fields (independently editable from display content) ────────────────
  metaTitle: { type: String, trim: true },       // fallback: title
  metaDescription: { type: String, trim: true },
  canonicalUrl: { type: String, trim: true },    // optional override
  ogImage: { type: String },                     // fallback: featuredImage
  robots: {
    index: { type: Boolean, default: true },     // index vs noindex
    follow: { type: Boolean, default: true },     // follow vs nofollow
  },
}, {
  timestamps: true,
});

// Auto-generate a unique slug from title (or a provided slug), respecting edits.
blogPostSchema.pre('validate', async function (next) {
  if (!this.slug && this.title) {
    this.slug = slugify(this.title);
  } else if (this.slug) {
    this.slug = slugify(this.slug);
  }

  if (this.slug && (this.isNew || this.isModified('slug'))) {
    const base = this.slug || 'post';
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

// Keep publishedAt consistent with status.
blogPostSchema.pre('save', function (next) {
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

// A post is publicly visible when it isn't a draft and its publishedAt is in the
// past. This lets a 'scheduled' post flip to visible on its own once the time
// passes — no cron/status-flip needed — while drafts stay hidden always.
blogPostSchema.statics.publicFilter = function () {
  return {
    status: { $in: ['published', 'scheduled'] },
    publishedAt: { $ne: null, $lte: new Date() },
  };
};

blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ category: 1 });
blogPostSchema.index({ tags: 1 });

module.exports = mongoose.model('BlogPost', blogPostSchema);
