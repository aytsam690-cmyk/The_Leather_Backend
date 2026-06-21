const mongoose = require('mongoose');

const socialLinkSchema = new mongoose.Schema({
  platform: { type: String, required: true },
  url: { type: String, required: true }
});

const settingsSchema = new mongoose.Schema({
  siteName: { type: String, required: true, default: 'My Ecommerce Store' },
  logo: { type: String },
  currency: { type: String, default: 'USD' },
  shippingCost: { type: Number, default: 10 },
  freeShippingAbove: { type: Number, default: 100 },
  courierName: { type: String, default: '' },
  courierWebsite: { type: String, default: '' },
  whatsappNumber: { type: String, default: '' },
  socialLinks: [socialLinkSchema],
  contactInfo: {
    email: { type: String },
    phone: { type: String },
    address: { type: String }
  },
  metaTags: {
    title: { type: String },
    description: { type: String },
    keywords: { type: String }
  },
  promoBanner: {
    enabled:    { type: Boolean, default: true },
    eyebrow:    { type: String, default: 'Limited Time' },
    heading:    { type: String, default: 'Up to 50% Off This Week' },
    subtext:    { type: String, default: "Don't miss our biggest sale. Limited stock — act fast." },
    buttonText: { type: String, default: 'Shop the Sale →' },
    buttonLink: { type: String, default: '/products' },
    image:      { type: String, default: '' },
    endDate:    { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  },
  footerDescription: { type: String, default: '' },
  footerColumns: [{
    title: { type: String },
    links: [{
      label: { type: String },
      url: { type: String },
    }],
  }],
  footerCopyright: { type: String, default: '' },
  footerBottomText: { type: String, default: '' },
}, {
  timestamps: true
});

const Settings = mongoose.model('Settings', settingsSchema);
module.exports = Settings;
