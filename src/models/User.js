const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const addressSchema = new mongoose.Schema({
  label: { type: String, default: 'Home' },          // e.g. Home, Office
  name: { type: String },                             // recipient name
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },            // renamed from province
  postalCode: { type: String, required: true },
  country: { type: String, default: 'Pakistan' },
  isDefault: { type: Boolean, default: false }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  addresses: [addressSchema],
  isActive: { type: Boolean, default: true },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  refreshToken: { type: String },
  resetPasswordToken: { type: String },
  resetPasswordExpire: { type: Date }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and return a password reset token
userSchema.methods.generateResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Store hashed version in database
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expiry to 1 hour from now
  this.resetPasswordExpire = Date.now() + 60 * 60 * 1000;

  // Return the unhashed token (to be sent via email)
  return resetToken;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
