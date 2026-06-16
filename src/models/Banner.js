const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String },
  image: { type: String, required: true },
  link: { type: String },
  btn: { type: String },
  position: { type: String, default: 'Home Hero' },
  bg: { type: String },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

const Banner = mongoose.model('Banner', bannerSchema);
module.exports = Banner;
