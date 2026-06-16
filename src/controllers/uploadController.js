const asyncHandler = require('express-async-handler');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// @desc    Upload image to Cloudinary
// @route   POST /api/upload/image
// @access  Private/Admin
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No image file provided');
  }

  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'shopverse',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' }, // Max dimensions
        { quality: 'auto', fetch_format: 'auto' }      // Auto optimize
      ]
    });

    res.json({
      url: result.secure_url,
      public_id: result.public_id
    });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500);
    throw new Error('Image upload failed: ' + error.message);
  }
});

module.exports = { uploadImage };
