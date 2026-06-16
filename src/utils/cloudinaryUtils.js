const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const deleteImageFromCloudinary = async (imageUrl) => {
  if (!imageUrl || !imageUrl.includes('cloudinary.com')) return;
  
  try {
    // Example URL: https://res.cloudinary.com/dfu19gnck/image/upload/v1234567890/shopverse/filename.jpg
    const parts = imageUrl.split('/upload/');
    if (parts.length < 2) return;
    
    let path = parts[1];
    
    // Remove version tag if present (e.g., v1612345678/)
    if (path.match(/^v\d+\//)) {
      path = path.replace(/^v\d+\//, '');
    }
    
    // Remove file extension
    const lastDotIndex = path.lastIndexOf('.');
    const publicId = lastDotIndex !== -1 ? path.substring(0, lastDotIndex) : path;
    
    if (publicId) {
      const result = await cloudinary.uploader.destroy(publicId);
      console.log(`[Cloudinary] Deleted image: ${publicId} | Result: ${result.result}`);
    }
  } catch (error) {
    console.error(`[Cloudinary] Failed to delete image ${imageUrl}:`, error);
  }
};

module.exports = { deleteImageFromCloudinary };
