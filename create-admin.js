/**
 * Simple Admin Account Creator
 * Run this script to create the admin account manually
 */

const mongoose = require('mongoose');
const { CONFIG } = require('./src/config/index.js');

async function createAdminAccount() {
  try {
    // Connect to database
    console.log('Connecting to MongoDB...');
    await mongoose.connect(CONFIG.MONGO_URI);
    console.log('Connected to MongoDB');

    // Import User model
    const User = require('./src/models/User.js');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: CONFIG.ADMIN_EMAIL });
    if (existingAdmin) {
      console.log('✅ Admin account already exists:');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👑 Role:', existingAdmin.role);
      console.log('📅 Created:', existingAdmin.createdAt);
      mongoose.connection.close();
      return;
    }

    // Create admin account
    console.log('Creating admin account...');
    const adminUser = new User({
      fullName: 'VerseNest Administrator',
      email: CONFIG.ADMIN_EMAIL,
      password: CONFIG.ADMIN_PASSWORD,
      role: 'admin',
      isVerified: true,
      isActive: true,
      privacySettings: {
        profileVisibility: 'private',
        showEmail: false,
        allowFollowers: false,
      }
    });

    await adminUser.save();

    console.log('🎉 Admin account created successfully!');
    console.log('📧 Email:', CONFIG.ADMIN_EMAIL);
    console.log('🔑 Password:', CONFIG.ADMIN_PASSWORD);
    console.log('👑 Role: admin');
    console.log('');
    console.log('🚀 You can now login with these credentials!');

  } catch (error) {
    console.error('❌ Error creating admin account:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

// Run the script
createAdminAccount();
