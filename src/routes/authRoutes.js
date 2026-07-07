const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { validateRequest } = require('../middleware/validateRequest');
const { protect } = require('../middleware/auth');
const {
  registerUser,
  loginUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
  updatePassword,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
  adminLogin
} = require('../controllers/authController');

// TESTING: Rate limiters temporarily commented out for load testing
// const adminLoginLimiter = rateLimit({...});
// const authLimiter = rateLimit({...});

// Validation schemas
const registerValidation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please include a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be 6 or more characters')
];

const loginValidation = [
  body('email').isEmail().withMessage('Please include a valid email'),
  body('password').exists().withMessage('Password is required')
];

// Public routes
router.post('/register', registerValidation, validateRequest, registerUser);
router.post('/login', loginValidation, validateRequest, loginUser);
router.post('/admin-login', adminLogin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/refresh-token', refreshAccessToken);

// Protected routes
router.post('/logout', protect, logoutUser);
router.get('/me', protect, getUserProfile);
router.put('/update-profile', protect, updateUserProfile);
router.put('/change-password', protect, updatePassword);

module.exports = router;
