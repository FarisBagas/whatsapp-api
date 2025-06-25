const sequelize = require('../config/database');
const User = require('../models/User');
require('dotenv').config();

const seedSuperAdmin = async () => {
  console.log('\n🌱 =============================');
  console.log('🌱  STARTING USER SEEDER');
  console.log('🌱 =============================');

  try {
    // Connect to database
    console.log('📊 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');

    // Sync User model (create table if not exists)
    console.log('📊 Syncing User model...');
    await User.sync();
    console.log('✅ User model synced successfully');

    // Get SuperAdmin credentials from environment
    const superAdminEmail = process.env.EMAIL_SUPER_ADMIN;
    const superAdminPassword = process.env.PASSOWRD_SUPER_ADMIN; // Note: typo in env matches your .env file

    console.log('📧 SuperAdmin Email:', superAdminEmail);
    console.log('🔑 Password Length:', superAdminPassword ? superAdminPassword.length : 0, 'characters');

    if (!superAdminEmail || !superAdminPassword) {
      throw new Error('EMAIL_SUPER_ADMIN and PASSOWRD_SUPER_ADMIN must be set in .env file');
    }

    // Check if SuperAdmin already exists
    console.log('🔍 Checking if SuperAdmin already exists...');
    const existingSuperAdmin = await User.findByEmail(superAdminEmail);

    if (existingSuperAdmin) {
      console.log('⚠️  SuperAdmin already exists!');
      console.log('🌱 Seeding completed - SuperAdmin already exists');
      return;
    }

    // Create SuperAdmin user
    console.log('👤 Creating SuperAdmin user...');
    const superAdmin = await User.create({
      email: superAdminEmail,
      password: superAdminPassword, // Will be hashed by beforeCreate hook
      role: 'super_admin',
      isActive: true
    });

    console.log('\n✅ =============================');
    console.log('✅  SUPERADMIN CREATED SUCCESS!');
    console.log('✅ =============================');

    // Test login functionality
    console.log('🧪 Testing password verification...');
    const isPasswordValid = await superAdmin.checkPassword(superAdminPassword);
    console.log('🔑 Password verification:', isPasswordValid ? '✅ SUCCESS' : '❌ FAILED');

    console.log('\n🌱 =============================');
    console.log('🌱  USER SEEDER COMPLETED!');
    console.log('🌱 =============================');

  } catch (error) {
    console.error('\n❌ =============================');
    console.error('❌  USER SEEDER FAILED!');
    console.error('❌ =============================');
    console.error('❌ Error:', error.message);
    console.error('❌ Stack:', error.stack);
    console.error('❌ =============================');
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await sequelize.close();
      console.log('📊 Database connection closed');
    } catch (closeError) {
      console.error('❌ Error closing database:', closeError.message);
    }
  }
};

// Run seeder if called directly
if (require.main === module) {
  seedSuperAdmin();
}

module.exports = seedSuperAdmin;