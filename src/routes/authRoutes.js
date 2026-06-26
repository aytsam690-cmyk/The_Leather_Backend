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

// ── Rate Limiters ────────────────────────────────────────────────────────────

// Strict limiter for admin login (5 attempts per 15 min per IP)
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many admin login attempts. Try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Standard limiter for auth routes (20 attempts per 15 min per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many attempts. Try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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
router.post('/register', authLimiter, registerValidation, validateRequest, registerUser);
router.post('/login', authLimiter, loginValidation, validateRequest, loginUser);
router.post('/admin-login', adminLoginLimiter, adminLogin);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);
router.post('/refresh-token', authLimiter, refreshAccessToken);

// Protected routes
router.post('/logout', protect, logoutUser);
router.get('/me', protect, getUserProfile);
router.put('/update-profile', protect, updateUserProfile);
router.put('/change-password', protect, updatePassword);

module.exports = router;
