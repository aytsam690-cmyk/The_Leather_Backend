/**
 * CRAFT HID — Full Data Cleanup Script
 * Deletes ALL data except the admin account.
 * Clears: Products, Banners, Orders, Reviews, Coupons, Categories, non-admin Users
 * Also purges ALL Cloudinary images.
 */

const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

// ── Config ──
const MONGODB_URI = 'mongodb+srv://aytsam690_db_user:QT9WMJqI7JzhCI5b@cluster0.dftd3ge.mongodb.net/shopverse';

cloudinary.config({
  cloud_name: 'dfu19gnck',
  api_key: '163973344692187',
  api_secret: 'J8m5rY2R4fU-HHAU8s-hYuo7uqU',
});

async function deleteAllCloudinaryResources() {
  console.log('\n🗑️  Deleting ALL Cloudinary images...');
  let totalDeleted = 0;
  let hasMore = true;
  let nextCursor = undefined;

  while (hasMore) {
    try {
      const result = await cloudinary.api.resources({
        type: 'upload',
        max_results: 500,
        next_cursor: nextCursor,
      });

      if (result.resources && result.resources.length > 0) {
        const publicIds = result.resources.map(r => r.public_id);
        const deleteResult = await cloudinary.api.delete_resources(publicIds);
        totalDeleted += publicIds.length;
        console.log(`   Deleted batch: ${publicIds.length} images (Total: ${totalDeleted})`);
      }

      nextCursor = result.next_cursor;
      hasMore = !!nextCursor;
    } catch (err) {
      console.log('   Cloudinary batch error:', err.message);
      hasMore = false;
    }
  }

  // Also delete folders
  try {
    const folders = await cloudinary.api.root_folders();
    for (const folder of folders.folders || []) {
      try {
        await cloudinary.api.delete_resources_by_prefix(folder.name + '/');
        await cloudinary.api.delete_folder(folder.name);
        console.log(`   Deleted folder: ${folder.name}`);
      } catch (e) {
        console.log(`   Could not delete folder ${folder.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.log('   No folders to delete or error:', e.message);
  }

  console.log(`✅ Cloudinary cleanup done! Deleted ${totalDeleted} images total.`);
}

async function main() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected!\n');

  const db = mongoose.connection.db;

  // List all collections
  const collections = await db.listCollections().toArray();
  console.log('📋 Collections found:', collections.map(c => c.name).join(', '));

  // Delete data from each collection (keep admin user)
  for (const col of collections) {
    const name = col.name;
    const collection = db.collection(name);

    if (name === 'users') {
      // Keep admin, delete everyone else
      const beforeCount = await collection.countDocuments();
      const result = await collection.deleteMany({ role: { $ne: 'admin' } });
      const afterCount = await collection.countDocuments();
      console.log(`🗑️  ${name}: Deleted ${result.deletedCount} non-admin users (kept ${afterCount} admin)`);
    } else if (name === 'settings') {
      // Keep settings (site config)
      const count = await collection.countDocuments();
      console.log(`⏭️  ${name}: Skipped (${count} docs — keeping site settings)`);
    } else {
      // Delete everything
      const count = await collection.countDocuments();
      const result = await collection.deleteMany({});
      console.log(`🗑️  ${name}: Deleted ${result.deletedCount} documents`);
    }
  }

  // ── Cloudinary cleanup ──
  await deleteAllCloudinaryResources();

  console.log('\n🎉 ALL DONE! Your database and Cloudinary are clean.');
  console.log('   ✅ Admin account preserved');
  console.log('   ✅ Site settings preserved');
  console.log('   ✅ Everything else deleted');
  console.log('\n   You can now add your real products! 🚀');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
