const express = require('express');
const verifyToken = require('../middleware/auth');
const { getQRCode, getStatus, sendMessage, resetSession, qrString, isReady } = require('../controllers/whatsappController');

const router = express.Router();

router.get('/qr', verifyToken, getQRCode);
router.get('/qr-page', verifyToken, (req, res) => {
  if (isReady) {
    return res.send(`
      <html>
        <body style="text-align:center; font-family:Arial;">
          <h2>WhatsApp sudah terhubung!</h2>
          <p>Status: Connected</p>
        </body>
      </html>
    `);
  }
  
  if (!qrString) {
    return res.send(`
      <html>
        <body style="text-align:center; font-family:Arial;">
          <h2>QR Code belum tersedia</h2>
          <p>Mohon tunggu...</p>
          <script>setTimeout(() => location.reload(), 3000);</script>
        </body>
      </html>
    `);
  }
  
  res.send(`
    <html>
      <body style="text-align:center; font-family:Arial; padding:20px;">
        <h2>Scan QR Code dengan WhatsApp</h2>
        <img src="${qrString}" alt="WhatsApp QR Code" style="width:200px; height:200px; border:1px solid #ccc; border-radius:8px;">
        <p>Scan dengan kamera WhatsApp di ponsel Anda</p>
        <script>setTimeout(() => location.reload(), 10000);</script>
      </body>
    </html>
  `);
});
router.get('/status', verifyToken, getStatus);
router.post('/send-message', verifyToken, sendMessage);
router.post('/reset-session', verifyToken, resetSession);

module.exports = router;
