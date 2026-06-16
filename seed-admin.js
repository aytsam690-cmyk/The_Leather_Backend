/**
 * One-time script to seed the admin user into MongoDB Atlas.
 * Run with: node seed-admin.js
 * Delete this file after running!
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dns = require('dns');

dns.setServers(['8.8.8.8', '8.8.4.4']);

const MONGODB_URI = 'mongodb+srv://aytsam690_db_user:QT9WMJqI7JzhCI5b@cluster0.dftd3ge.mongodb.net/shopverse';

const userSchema = new mongoose.Schema({
  name:     String,
  email:    { type: String, unique: true },
  password: String,
  role:     { type: String, default: 'customer' },
  isActive: { type: Boolean, default: true },
  phone:    String,
}, { timestamps: true });

userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

const User = mongoose.model('User', userSchema);

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');

    const existing = await User.findOne({ email: 'admin@shopverse.com' });
    if (existing) {
      console.log('ℹ️  Admin user already exists — skipping creation.');
    } else {
      const admin = new User({
        name: 'Admin',
        email: 'admin@shopverse.com',
        password: 'admin123',
        role: 'admin',
        isActive: true,
        phone: '+1 000-000-0000',
      });
      await admin.save();
      console.log('✅ Admin user created successfully!');
      console.log('   Email:      admin@shopverse.com');
      console.log('   Password:   admin123');
      console.log('   Secret Key: shopverse-admin-2025');
    }

    await mongoose.disconnect();
    console.log('✅ Done. You can now log into /admin/login');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

seed();
