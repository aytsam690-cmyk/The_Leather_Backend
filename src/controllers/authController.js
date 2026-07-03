const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const tokenBlacklist = require('../utils/tokenBlacklist');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../utils/emailService');
const { ensureString } = require('../utils/sanitize');

// Generate short-lived access token (15 minutes)
const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

// Generate long-lived refresh token (7 days)
const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });
};

// Check if a token is blacklisted
const isTokenBlacklisted = (token) => {
  return tokenBlacklist.has(token);
};

// Helper: set refresh token cookie on the response
const setRefreshCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  // Guard against NoSQL injection
  const safeEmail = ensureString(email);
  if (!safeEmail) {
    res.status(400);
    throw new Error('Invalid email format');
  }

  const userExists = await User.findOne({ email: safeEmail });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  const safePassword = ensureString(password);
  if (!safePassword || safePassword.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }

  const user = await User.create({
    name: ensureString(name) || '',
    email: safeEmail,
    password: safePassword,
    phone: ensureString(phone) || '',
  });

  if (user) {
    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Store hashed refresh token in DB
    user.refreshToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    await user.save();

    // Set refresh token as httpOnly cookie
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      accessToken,
    });

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user.email, user.name).catch(() => {});
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password, adminSecretKey } = req.body;

  // Guard against NoSQL injection
  const safeEmail = ensureString(email);
  if (!safeEmail) {
    res.status(400);
    throw new Error('Invalid email format');
  }

  const safePassword = ensureString(password);
  if (!safePassword) {
    res.status(400);
    throw new Error('Invalid password format');
  }

  const user = await User.findOne({ email: safeEmail });

  if (user && user.isActive && (await user.matchPassword(safePassword))) {
    // Extra gate for admin accounts: require the server-side secret key
    if (user.role === 'admin') {
      const validKey = process.env.ADMIN_SECRET_KEY;
      if (!adminSecretKey || adminSecretKey !== validKey) {
        res.status(403);
        throw new Error('Invalid admin secret key');
      }
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Store hashed refresh token in DB
    user.refreshToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    await user.save();

    // Set refresh token as httpOnly cookie
    setRefreshCookie(res, refreshToken);

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      accessToken,
    });
  } else {
    res.status(401);
    throw new Error('Invalid email or password (or inactive account)');
  }
});

// @desc    Logout user — blacklist access token, clear refresh cookie & DB token
// @route   POST /api/auth/logout
// @access  Private
const logoutUser = asyncHandler(async (req, res) => {
  // Blacklist the current access token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer')) {
    const accessToken = authHeader.split(' ')[1];
    tokenBlacklist.add(accessToken);
  }

  // Clear refresh token cookie
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  // Clear stored refresh token in DB
  const user = await User.findById(req.user._id);
  if (user) {
    user.refreshToken = undefined;
    await user.save();
  }

  res.status(200).json({ message: 'Logged out successfully' });
});

// @desc    Refresh the access token using refresh token cookie
// @route   POST /api/auth/refresh-token
// @access  Public (cookie required)
const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies && req.cookies.refreshToken;

  if (!refreshToken) {
    res.status(401);
    throw new Error('No refresh token provided');
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    // Invalid or expired refresh token — clear the cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    res.status(401);
    throw new Error('Invalid or expired refresh token');
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    res.status(401);
    throw new Error('User not found or inactive');
  }

  // Verify the stored refresh token hash matches
  const hashedToken = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  if (user.refreshToken !== hashedToken) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    res.status(401);
    throw new Error('Refresh token mismatch — possible token reuse');
  }

  // Issue a new access token
  const accessToken = generateAccessToken(user._id);

  res.json({ accessToken });
});

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password -refreshToken');
  if (user) {
    res.json(user);
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Update user profile
// @route   PUT /api/auth/update-profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    user.name = req.body.name || user.name;
    user.phone = req.body.phone || user.phone;

    if (req.body.addresses) {
      user.addresses = req.body.addresses;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      accessToken: generateAccessToken(updatedUser._id),
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const updatePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  const safeOldPassword = ensureString(req.body.oldPassword);
  const safeNewPassword = ensureString(req.body.newPassword);
  if (!safeOldPassword || !safeNewPassword) {
    res.status(400);
    throw new Error('Invalid password format');
  }
  if (safeNewPassword.length < 6) {
    res.status(400);
    throw new Error('New password must be at least 6 characters');
  }

  if (user && (await user.matchPassword(safeOldPassword))) {
    user.password = safeNewPassword;
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } else {
    res.status(401);
    throw new Error('Invalid old password');
  }
});

// @desc    Forgot password — generate reset token and send email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Guard against NoSQL injection
  const safeEmail = ensureString(email);
  if (!safeEmail) {
    res.status(400);
    throw new Error('Invalid email format');
  }

  const user = await User.findOne({ email: safeEmail });

  const genericMessage = `If an account exists for ${safeEmail}, a password reset email has been sent.`;

  if (!user) {
    // Prevent user enumeration by simulating success
    return res.json({ message: genericMessage });
  }

  // Generate reset token
  const resetToken = user.generateResetToken();
  await user.save();

  // Build reset URL
  const frontendUrl = 'https://www.crafthid.com';
  const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

  try {
    await sendPasswordResetEmail(user.email, resetUrl);
    res.json({ message: genericMessage });
  } catch (err) {
    // If email sending fails, clear the reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(500);
    throw new Error('Email could not be sent. Please try again later.');
  }
});

// @desc    Reset password using token
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  // Hash the token from the URL to compare with stored hash
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error('Invalid or expired reset token');
  }

  // Set new password
  const safeNewPassword = ensureString(req.body.password);
  if (!safeNewPassword || safeNewPassword.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }
  user.password = safeNewPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  res.json({ message: 'Password has been reset successfully' });
});

// @desc    Admin login via secret key only (no email/password needed)
// @route   POST /api/auth/admin-login
// @access  Public
const adminLogin = asyncHandler(async (req, res) => {
  const { secretKey } = req.body;

  const safeKey = ensureString(secretKey);
  if (!safeKey) {
    res.status(400);
    throw new Error('Admin secret key is required');
  }

  if (safeKey !== process.env.ADMIN_SECRET_KEY) {
    res.status(403);
    throw new Error('Invalid admin secret key. Access denied.');
  }

  // Find the admin user account in DB
  const adminUser = await User.findOne({ role: 'admin', isActive: true });
  if (!adminUser) {
    res.status(404);
    throw new Error('No active admin account found.');
  }

  // Generate tokens
  const accessToken = generateAccessToken(adminUser._id);
  const refreshToken = generateRefreshToken(adminUser._id);

  // Store hashed refresh token in DB
  adminUser.refreshToken = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');
  await adminUser.save();

  // Set refresh token as httpOnly cookie
  setRefreshCookie(res, refreshToken);

  res.json({
    _id: adminUser._id,
    name: adminUser.name,
    email: adminUser.email,
    role: adminUser.role,
    accessToken,
  });
});

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  isTokenBlacklisted,
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getUserProfile,
  updateUserProfile,
  updatePassword,
  forgotPassword,
  resetPassword,
  adminLogin,
};
