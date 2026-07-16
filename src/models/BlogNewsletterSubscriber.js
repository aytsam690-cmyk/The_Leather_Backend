// BLOG FEATURE — PATCH 1 — MODELS
const mongoose = require('mongoose');

const blogNewsletterSubscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  subscribedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

const BlogNewsletterSubscriber = mongoose.model('BlogNewsletterSubscriber', blogNewsletterSubscriberSchema);
module.exports = BlogNewsletterSubscriber;
