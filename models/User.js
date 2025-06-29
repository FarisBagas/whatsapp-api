const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  refreshTokenExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'users',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

// Instance method untuk compare password
User.prototype.comparePassword = async function(password) {
  try {
    const result = await bcrypt.compare(password, this.password);
    return result;
  } catch (error) {
    console.error('❌ Error in comparePassword:', error);
    return false;
  }
};

// Alias method untuk checkPassword (digunakan di seeder)
User.prototype.checkPassword = async function(password) {
  return this.comparePassword(password);
};

// Static method untuk mencari user berdasarkan email
User.findByEmail = async function(email) {
  try {
    return await this.findOne({
      where: { email: email }
    });
  } catch (error) {
    console.error('❌ Error in findByEmail:', error);
    return null;
  }
};

module.exports = User;
