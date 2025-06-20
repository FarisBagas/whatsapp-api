const express = require('express');
const { login, refreshToken, logout } = require('../controllers/authController');
const verifyToken = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', verifyToken, logout);

module.exports = router;
