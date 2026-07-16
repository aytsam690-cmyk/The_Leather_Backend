// BLOG FEATURE — PATCH 1 — MODELS
const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  content: { type: String },
  excerpt: { type: String, maxlength: 300 },
  featuredImage: { type: String },
  featuredImageAlt: { type: String },
  metaTitle: { type: String },
  metaDescription: { type: String, maxlength: 160 },
  tags: [{ type: String }],
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogCategory' },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  isPinned: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  readTime: { type: Number, default: 0 },
  linkedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  publishedAt: { type: Date }
}, {
  timestamps: true
});

blogPostSchema.pre('validate', function (next) {
  // Auto-generate slug from title if slug is empty
  if (!this.slug && this.title) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  }

  // Auto-calculate readTime from content word count divided by 200
  if (this.content) {
    const wordCount = this.content.split(/\s+/).filter(word => word.length > 0).length;
    this.readTime = Math.ceil(wordCount / 200);
  } else {
    this.readTime = 0;
  }

  // Auto-generate excerpt from content (strip HTML tags, take first 300 chars) if excerpt is empty
  if (!this.excerpt && this.content) {
    const strippedContent = this.content.replace(/<[^>]+>/g, '');
    this.excerpt = strippedContent.substring(0, 300).trim();
  }

  next();
});

blogPostSchema.pre('save', function (next) {
  // Auto-set publishedAt when status changes to 'published'
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  next();
});

const BlogPost = mongoose.model('BlogPost', blogPostSchema);
module.exports = BlogPost;
