const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
  
  const refreshToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN
  });
  
  return { accessToken, refreshToken };
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Email and password are required'
      });
    }
    
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    // Coba manual bcrypt compare langsung
    const manualCompare = await bcrypt.compare(password, user.password);
    console.log('Manual bcrypt compare result:', manualCompare);
    
    // Coba method dari user model
    let passwordMatch = false;
    if (typeof user.comparePassword === 'function') {
      passwordMatch = await user.comparePassword(password);
      console.log('User model compare result:', passwordMatch);
    } else {
      console.log('❌ comparePassword method not found on user model');
      // Fallback ke manual compare
      passwordMatch = manualCompare;
    }
    
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);
    
    await user.update({ 
      refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiry
    });
    
    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required' });
    }
    
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId);
    
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    
    if (user.refreshTokenExpiresAt && new Date() > user.refreshTokenExpiresAt) {
      await user.update({ refreshToken: null, refreshTokenExpiresAt: null });
      return res.status(401).json({ message: 'Refresh token expired' });
    }
    
    const tokens = generateTokens(user.id);
    
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);
    
    await user.update({ 
      refreshToken: tokens.refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiry
    });
    
    res.json(tokens);
  } catch (error) {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

const logout = async (req, res) => {
  try {
    const user = req.user;
    
    await user.update({ 
      refreshToken: null, 
      refreshTokenExpiresAt: null 
    });
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { login, refreshToken, logout };
