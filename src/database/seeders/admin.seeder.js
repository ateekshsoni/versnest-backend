/**
 * 👑 ADMIN ACCOUNT SEEDER
 * 
 * This script creates a static admin account with predefined credentials.
 * The admin account has special privileges and cannot be modified through
 * normal user operations for security purposes.
 * 
 * Security Features:
 * - Hardcoded admin credentials (from environment)
 * - Admin role with special permissions
 * - Account cannot be deleted or password changed via API
 * - All admin actions are logged for audit trails
 * 
 * Learning Points:
 * - Database seeding patterns
 * - Admin account security practices
 * - Environment-based configuration
 * - Audit logging importance
 */

const { CONFIG } = require('../../config/index.js');
const connectDB = require('../../database/connection.js');
const { appLogger } = require('../../utils/logger.js');
const User = require('../../models/User.js');

/**
 * 👑 Admin Account Configuration
 */
const ADMIN_CONFIG = {
  fullName: 'VerseNest Administrator',
  email: CONFIG.ADMIN_EMAIL,
  password: CONFIG.ADMIN_PASSWORD,
  role: 'admin',
  penName: 'System Admin',
  bio: 'VerseNest Platform Administrator - Managing content and community standards.',
  genres: ['Other'],
  isVerified: true,
  isActive: true,
  privacySettings: {
    profileVisibility: 'private',
    showEmail: false,
    allowFollowers: false,
  },
  // Admin-specific metadata
  adminMetadata: {
    isStaticAdmin: true,
    createdBy: 'system',
    permissions: ['*'], // All permissions
    canBeDeleted: false,
    canChangePassword: false,
  }
};

/**
 * 🔧 Create Admin Account
 */
async function createAdminAccount() {
  try {
    console.log('🚀 Starting admin account creation...');
    
    // Connect to database
    await connectDB();
    console.log('✅ Database connected');
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ 
      email: ADMIN_CONFIG.email,
      role: 'admin' 
    });
    
    if (existingAdmin) {
      console.log('⚠️  Admin account already exists');
      
      // Update admin account if needed
      const updated = await updateExistingAdmin(existingAdmin);
      if (updated) {
        console.log('✅ Admin account updated successfully');
      } else {
        console.log('ℹ️  Admin account is up to date');
      }
      
      return existingAdmin;
    }
    
    // Create new admin account
    const admin = new User({
      ...ADMIN_CONFIG,
      metadata: {
        ...ADMIN_CONFIG.adminMetadata,
        createdAt: new Date(),
      }
    });
    
    // Save admin account
    await admin.save();
    
    // Log admin creation
    appLogger.error('Admin account created', {
      adminId: admin._id,
      email: admin.email,
      createdBy: 'seeder',
    });
    
    console.log('✅ Admin account created successfully');
    console.log(`📧 Email: ${admin.email}`);
    console.log(`🔑 Password: ${CONFIG.ADMIN_PASSWORD}`);
    console.log(`👑 Role: ${admin.role}`);
    
    return admin;
    
  } catch (error) {
    console.error('❌ Failed to create admin account:', error.message);
    appLogger.error('Admin account creation failed', {
      error: error.message,
      stack: error.stack,
    });
    
    throw error;
  }
}

/**
 * 🔄 Update Existing Admin Account
 */
async function updateExistingAdmin(existingAdmin) {
  try {
    let hasUpdates = false;
    
    // Update fields that might have changed
    const updatableFields = [
      'fullName',
      'penName', 
      'bio',
      'isVerified',
      'isActive',
      'privacySettings'
    ];
    
    for (const field of updatableFields) {
      if (ADMIN_CONFIG[field] && 
          JSON.stringify(existingAdmin[field]) !== JSON.stringify(ADMIN_CONFIG[field])) {
        existingAdmin[field] = ADMIN_CONFIG[field];
        hasUpdates = true;
      }
    }
    
    // Update metadata
    if (!existingAdmin.metadata) {
      existingAdmin.metadata = {};
    }
    
    existingAdmin.metadata = {
      ...existingAdmin.metadata,
      ...ADMIN_CONFIG.adminMetadata,
      lastUpdated: new Date(),
    };
    hasUpdates = true;
    
    // Save if there are updates
    if (hasUpdates) {
      await existingAdmin.save();
      
      appLogger.info('Admin account updated', {
        adminId: existingAdmin._id,
        email: existingAdmin.email,
        updatedBy: 'seeder',
      });
    }
    
    return hasUpdates;
    
  } catch (error) {
    console.error('❌ Failed to update admin account:', error.message);
    throw error;
  }
}

/**
 * 🔍 Verify Admin Account
 */
async function verifyAdminAccount() {
  try {
    const admin = await User.findOne({ 
      email: CONFIG.ADMIN_EMAIL,
      role: 'admin' 
    });
    
    if (!admin) {
      console.log('❌ Admin account not found');
      return false;
    }
    
    console.log('✅ Admin account verification:');
    console.log(`   📧 Email: ${admin.email}`);
    console.log(`   👤 Name: ${admin.fullName}`);
    console.log(`   👑 Role: ${admin.role}`);
    console.log(`   ✅ Verified: ${admin.isVerified}`);
    console.log(`   🟢 Active: ${admin.isActive}`);
    console.log(`   📅 Created: ${admin.createdAt}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Admin verification failed:', error.message);
    return false;
  }
}

/**
 * 🗑️ Remove Admin Account (for testing only)
 */
async function removeAdminAccount() {
  try {
    if (CONFIG.NODE_ENV === 'production') {
      console.log('❌ Cannot remove admin account in production');
      return false;
    }
    
    const result = await User.deleteOne({ 
      email: CONFIG.ADMIN_EMAIL,
      role: 'admin' 
    });
    
    if (result.deletedCount > 0) {
      console.log('✅ Admin account removed');
      
      appLogger.error('Admin account removed', {
        email: CONFIG.ADMIN_EMAIL,
        removedBy: 'seeder',
        environment: CONFIG.NODE_ENV,
      });
      
      return true;
    } else {
      console.log('ℹ️  No admin account found to remove');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Failed to remove admin account:', error.message);
    throw error;
  }
}

/**
 * 📊 Get Admin Statistics
 */
async function getAdminStats() {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          verified: { $sum: { $cond: ['$isVerified', 1, 0] } }
        }
      }
    ]);
    
    console.log('📊 User Statistics:');
    stats.forEach(stat => {
      console.log(`   ${stat._id}: ${stat.count} total, ${stat.active} active, ${stat.verified} verified`);
    });
    
    return stats;
    
  } catch (error) {
    console.error('❌ Failed to get admin stats:', error.message);
    throw error;
  }
}

/**
 * 🏃‍♂️ Main Execution Function
 */
async function main() {
  try {
    const command = process.argv[2] || 'create';
    
    switch (command) {
      case 'create':
        await createAdminAccount();
        await verifyAdminAccount();
        break;
        
      case 'verify':
        await connectDB();
        await verifyAdminAccount();
        break;
        
      case 'remove':
        await connectDB();
        await removeAdminAccount();
        break;
        
      case 'stats':
        await connectDB();
        await getAdminStats();
        break;
        
      default:
        console.log(`
🔧 VerseNest Admin Seeder

Usage: node admin.seeder.js [command]

Commands:
  create   - Create or update admin account (default)
  verify   - Verify admin account exists and show details
  remove   - Remove admin account (development only)
  stats    - Show user statistics

Examples:
  npm run seed:admin
  npm run seed:admin create
  npm run seed:admin verify
        `);
    }
    
  } catch (error) {
    console.error('💥 Seeder failed:', error.message);
    process.exit(1);
  } finally {
    // Close database connection
    if (process.argv[2] !== 'help') {
      process.exit(0);
    }
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export functions for programmatic use
module.exports = {
  createAdminAccount,
  updateExistingAdmin,
  verifyAdminAccount,
  removeAdminAccount,
  getAdminStats,
  ADMIN_CONFIG,
};
