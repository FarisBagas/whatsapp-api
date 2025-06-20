const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: (msg) => {
      // Only log important database operations
      if (msg.includes('CREATE') || msg.includes('ALTER') || msg.includes('INSERT')) {
        console.log('📊 DB:', msg.substring(0, 100) + (msg.length > 100 ? '...' : ''));
      }
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

module.exports = sequelize;
