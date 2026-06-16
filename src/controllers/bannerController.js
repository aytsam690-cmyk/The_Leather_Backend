const asyncHandler = require('express-async-handler');
const Banner = require('../models/Banner');
const { deleteImageFromCloudinary } = require('../utils/cloudinaryUtils');

// @desc    Get all banners
// @route   GET /api/banners
// @access  Public (active only) / Admin (all)
const getBanners = asyncHandler(async (req, res) => {
  const filter = req.user?.role === 'admin' ? {} : { isActive: true };
  const banners = await Banner.find(filter).sort('order');
  const fixedBanners = banners.map(b => {
    const obj = b.toObject();
    if (!obj.position) obj.position = 'Home Hero';
    return obj;
  });
  res.json(fixedBanners);
});

// @desc    Create a banner
// @route   POST /api/banners
// @access  Private/Admin
const createBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.create(req.body);
  res.status(201).json(banner);
});

// @desc    Update a banner
// @route   PUT /api/banners/:id
// @access  Private/Admin
const updateBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (banner) {
    res.json(banner);
  } else {
    res.status(404);
    throw new Error('Banner not found');
  }
});

// @desc    Delete a banner and its images
// @route   DELETE /api/banners/:id
// @access  Private/Admin
const deleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id);
  if (banner) {
    if (banner.image) await deleteImageFromCloudinary(banner.image);
    if (banner.mobileImage) await deleteImageFromCloudinary(banner.mobileImage);
    
    await banner.deleteOne();
    res.json({ message: 'Banner and associated images removed' });
  } else {
    res.status(404);
    throw new Error('Banner not found');
  }
});

// @desc    Reorder banners
// @route   POST /api/banners/reorder
// @access  Private/Admin
const reorderBanners = asyncHandler(async (req, res) => {
  const { order } = req.body; // array of { id, order }
  for (const item of order) {
    await Banner.findByIdAndUpdate(item.id, { order: item.order });
  }
  res.json({ message: 'Banners reordered' });
});

module.exports = { getBanners, createBanner, updateBanner, deleteBanner, reorderBanners };
