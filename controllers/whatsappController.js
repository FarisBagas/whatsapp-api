const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

let client = null;
let qrString = '';
let isReady = false;
let initializationStatus = 'idle'; // idle, initializing, ready, error

const initializeWhatsApp = async () => {
  console.log('🔍 initializeWhatsApp called, current status:', initializationStatus);
  console.log('🔍 client exists:', !!client);
  console.log('🔍 isReady:', isReady);
  
  if (client && initializationStatus !== 'error') {
    console.log('📱 WhatsApp client already exists, status:', initializationStatus);
    return;
  }
  
  if (initializationStatus === 'initializing') {
    console.log('📱 WhatsApp client is already being initialized');
    return;
  }
  
  try {
    initializationStatus = 'initializing';
    console.log('📱 Creating WhatsApp client...');
    
    const sessionPath = path.join(__dirname, '..', 'whatsapp-session');
    console.log('📱 Session path:', sessionPath);
    
    // Check if session exists
    const sessionExists = fs.existsSync(sessionPath);
    console.log('📱 Session exists:', sessionExists);
    
    if (sessionExists) {
      console.log('📱 Session folder contents:');
      try {
        const contents = fs.readdirSync(sessionPath);
        console.log('📱 Files in session:', contents);
      } catch (e) {
        console.log('📱 Could not read session folder:', e.message);
      }
    }
    
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: sessionPath
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      }
    });

    console.log('📱 Setting up event listeners...');

    client.on('loading_screen', (percent, message) => {
      console.log(`📱 Loading: ${percent}% - ${message}`);
    });

    client.on('qr', async (qr) => {
      console.log('\n📱 =============================');
      console.log('📱    🎯 QR CODE GENERATED!');
      console.log('📱 =============================');
      console.log('📱 QR Code received, scan with your phone');
      console.log('📱 Access QR via: GET /api/whatsapp/qr');
      console.log('📱 Browser QR: GET /api/whatsapp/qr-page');
      console.log('📱 =============================');
      
      try {
        qrString = await qrcode.toDataURL(qr);
        console.log('✅ QR code data URL generated successfully');
        console.log('✅ QR string length:', qrString.length);
        
        // Generate ASCII QR for console
        const qrAscii = await qrcode.toString(qr, { 
          type: 'terminal',
          width: 40,
          small: true
        });
        console.log('📱 QR Code (scan with WhatsApp):');
        console.log(qrAscii);
        console.log('📱 =============================\n');
      } catch (error) {
        console.error('❌ Error generating QR code:', error.message);
      }
    });

    client.on('authenticated', () => {
      console.log('✅ WhatsApp authenticated successfully');
    });

    client.on('auth_failure', (msg) => {
      console.error('❌ WhatsApp authentication failed:', msg);
      isReady = false;
      initializationStatus = 'error';
      
      // Clear session on auth failure
      const sessionPath = path.join(__dirname, '..', 'whatsapp-session');
      if (fs.existsSync(sessionPath)) {
        console.log('🔄 Clearing session due to auth failure...');
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }
    });

    client.on('ready', () => {
      console.log('\n✅ =============================');
      console.log('✅   WhatsApp client is ready!');
      console.log('✅ =============================\n');
      isReady = true;
      qrString = ''; // Clear QR string when ready
      initializationStatus = 'ready';
    });

    client.on('disconnected', (reason) => {
      console.log('🔌 WhatsApp client disconnected:', reason);
      isReady = false;
      client = null;
      qrString = '';
      initializationStatus = 'idle';
    });

    // Add error event handler
    client.on('error', (error) => {
      console.error('❌ WhatsApp client error:', error.message);
      console.error('❌ Error stack:', error.stack);
      initializationStatus = 'error';
    });

    console.log('📱 Initializing WhatsApp client...');
    
    // Add timeout for initialization
    const initPromise = client.initialize();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Initialization timeout after 60 seconds')), 60000);
    });
    
    await Promise.race([initPromise, timeoutPromise]);
    console.log('📱 WhatsApp client initialization completed');
    
  } catch (error) {
    console.error('❌ Failed to initialize WhatsApp client:', error.message);
    console.error('❌ Stack trace:', error.stack);
    initializationStatus = 'error';
    client = null;
    
    // If initialization fails, try clearing session
    const sessionPath = path.join(__dirname, '..', 'whatsapp-session');
    if (fs.existsSync(sessionPath)) {
      console.log('🔄 Clearing session due to initialization error...');
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('✅ Session cleared');
      } catch (clearError) {
        console.error('❌ Failed to clear session:', clearError.message);
      }
    }
    
    throw error;
  }
};

const getQRCode = (req, res) => {
  console.log('🔍 getQRCode called');
  console.log('🔍 isReady:', isReady);
  console.log('🔍 qrString length:', qrString.length);
  console.log('🔍 initializationStatus:', initializationStatus);
  
  if (isReady) {
    return res.json({ 
      message: 'WhatsApp is already connected',
      isReady: true
    });
  }
  
  if (!qrString) {
    return res.status(400).json({ 
      message: 'QR code not available yet. Please wait...',
      isReady: false,
      qr: null,
      status: initializationStatus
    });
  }
  
  res.json({ 
    qr: qrString,
    isReady: false,
    message: 'Scan this QR code with WhatsApp'
  });
};

const getStatus = (req, res) => {
  res.json({ 
    isReady,
    status: initializationStatus,
    hasQR: !!qrString,
    clientExists: !!client,
    message: isReady ? 'WhatsApp is connected' : `WhatsApp is not connected (${initializationStatus})`
  });
};

const sendMessage = async (req, res) => {
  try {
    if (!isReady) {
      return res.status(400).json({ message: 'WhatsApp is not connected' });
    }
    
    const { number, message } = req.body;
    
    if (!number || !message) {
      return res.status(400).json({ message: 'Number and message are required' });
    }
    
    // Validasi dan format nomor yang lebih ketat
    let formattedNumber = number.toString().replace(/\D/g, ''); // Hapus semua karakter non-digit
    
    // Validasi panjang nomor
    if (formattedNumber.length < 10 || formattedNumber.length > 15) {
      return res.status(400).json({ 
        message: 'Invalid phone number length. Must be 10-15 digits.',
        received: number
      });
    }
    
    // Jika nomor dimulai dengan 0, ganti dengan kode negara Indonesia (62)
    if (formattedNumber.startsWith('0')) {
      formattedNumber = '62' + formattedNumber.substring(1);
    }
    
    // Jika nomor tidak dimulai dengan kode negara, tambahkan 62 (Indonesia)
    if (!formattedNumber.startsWith('62')) {
      formattedNumber = '62' + formattedNumber;
    }
    
    // Format final dengan suffix @c.us
    const chatId = formattedNumber + '@c.us';
    
    console.log('📱 Sending message:');
    console.log('📱 Original number:', number);
    console.log('📱 Formatted number:', formattedNumber);
    console.log('📱 Chat ID:', chatId);
    console.log('📱 Message:', message.substring(0, 50));
    
    // Validasi nomor dengan WhatsApp sebelum mengirim
    try {
      const contact = await client.getContactById(chatId);
      if (!contact.isWAContact) {
        return res.status(400).json({ 
          message: 'Number is not registered on WhatsApp',
          number: formattedNumber
        });
      }
    } catch (contactError) {
      return res.status(400).json({ 
        message: 'Invalid WhatsApp number or not registered',
        number: formattedNumber,
        error: contactError.message
      });
    }
    
    // Kirim pesan
    const sentMessage = await client.sendMessage(chatId, message);
    
    res.json({ 
      success: true, 
      message: 'Message sent successfully',
      to: formattedNumber,
      chatId: chatId,
      messageId: sentMessage.id._serialized
    });
  } catch (error) {
    console.error('❌ Send message error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send message', 
      error: error.message 
    });
  }
};

const resetSession = async (req, res) => {
  try {
    console.log('🔄 Resetting WhatsApp session...');
    
    if (client) {
      console.log('📱 Destroying existing client...');
      try {
        await client.destroy();
      } catch (destroyError) {
        console.log('⚠️ Error destroying client:', destroyError.message);
      }
      client = null;
    }
    
    isReady = false;
    qrString = '';
    initializationStatus = 'idle';
    
    // Delete session folder
    const sessionPath = path.join(__dirname, '..', 'whatsapp-session');
    console.log('📱 Deleting session folder:', sessionPath);
    
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log('✅ Session folder deleted');
    }
    
    res.json({ 
      success: true, 
      message: 'Session reset successfully. Initializing new session...' 
    });
    
    // Reinitialize after reset
    setTimeout(async () => {
      try {
        console.log('🔄 Reinitializing WhatsApp after reset...');
        await initializeWhatsApp();
      } catch (error) {
        console.error('❌ Failed to reinitialize after reset:', error.message);
      }
    }, 2000);
    
  } catch (error) {
    console.error('❌ Reset session error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset session', 
      error: error.message 
    });
  }
};

module.exports = {
  initializeWhatsApp,
  getQRCode,
  getStatus,
  sendMessage,
  resetSession,
  // Export untuk digunakan di routes
  get qrString() { return qrString; },
  get isReady() { return isReady; },
  get initializationStatus() { return initializationStatus; }
};
