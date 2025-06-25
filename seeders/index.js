const sequelize = require('../config/database');
const userSeeder = require('./userSeeder');
require('dotenv').config();

const runAllSeeders = async () => {
  console.log('\n🌱 =============================');
  console.log('🌱  STARTING ALL SEEDERS');
  console.log('🌱 =============================');

  try {
    // Connect to database
    console.log('📊 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');

    // Run User Seeder
    console.log('\n📝 Running User Seeder...');
    await userSeeder();
    console.log('✅ User Seeder completed');

    // Add more seeders here in the future
    // Example:
    // console.log('\n📝 Running Product Seeder...');
    // await productSeeder();
    // console.log('✅ Product Seeder completed');

    console.log('\n🌱 =============================');
    console.log('🌱  ALL SEEDERS COMPLETED!');
    console.log('🌱 =============================');

  } catch (error) {
    console.error('\n❌ =============================');
    console.error('❌  SEEDERS FAILED!');
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

// Run all seeders if called directly
if (require.main === module) {
  runAllSeeders();
}

module.exports = {
  runAllSeeders,
  userSeeder
};