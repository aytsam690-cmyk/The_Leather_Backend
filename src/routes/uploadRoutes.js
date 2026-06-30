const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const { uploadImage } = require('../controllers/uploadController');
const { upload } = require('../middleware/uploadMiddleware');

router.post('/image', protect, admin, upload.single('image'), uploadImage);

module.exports = router;
