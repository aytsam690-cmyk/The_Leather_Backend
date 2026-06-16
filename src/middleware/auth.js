const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const tokenBlacklist = require('../utils/tokenBlacklist');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  // Check if token is blacklisted
  if (tokenBlacklist.has(token)) {
    res.status(401);
    throw new Error('Token has been revoked');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user || !req.user.isActive) {
      res.status(401);
      throw new Error('Not authorized, user inactive or not found');
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      res.status(401);
      throw new Error('TOKEN_EXPIRED');
    }
    res.status(401);
    throw new Error('Not authorized, token failed');
  }
});

// Optional auth — sets req.user if token present, but allows guests through
const optionalProtect = asyncHandler(async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token && !tokenBlacklist.has(token)) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    } catch (_) {}
  }

  next();
});

module.exports = { protect, optionalProtect };
