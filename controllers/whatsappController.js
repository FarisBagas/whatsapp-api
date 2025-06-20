const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const SQLiteMessageQueue = require('../utils/sqliteMessageQueue');
const SQLiteQueueProcessor = require('../utils/sqliteQueueProcessor');

let client = null;
let qrString = '';
let isReady = false;
let initializationStatus = 'idle'; // idle, initializing, ready, error

// SQLite Queue System
let messageQueue = null;
let queueProcessor = null;

// Auto-recovery variables
let keepAliveInterval = null;
let lastActivity = Date.now();

// Initialize SQLite queue system
const initializeQueueSystem = async () => {
  if (!messageQueue) {
    try {
      messageQueue = new SQLiteMessageQueue();
      queueProcessor = new SQLiteQueueProcessor(messageQueue, () => {
        return {
          isReady: isReady,
          client: client  // Pass client directly
        };
      });
      
      // Setup event listeners for queue processor
      queueProcessor.on('messageSuccess', (data) => {
        console.log(`✅ SQLite Queue: Message ${data.messageId} delivered to ${data.to}`);
      });
      
      queueProcessor.on('messageRetry', (data) => {
        console.log(`🔄 SQLite Queue: Retrying message ${data.messageId} (attempt ${data.attempts})`);
      });
      
      queueProcessor.on('messageFailed', (data) => {
        console.log(`❌ SQLite Queue: Message ${data.messageId} failed after ${data.attempts} attempts`);
      });
      
      queueProcessor.on('stalledJobs', (data) => {
        console.log(`⚠️ SQLite Queue: ${data.count} stalled jobs detected and handled`);
      });
      
      console.log('📊 SQLite Queue System initialized');
    } catch (error) {
      console.error('❌ Failed to initialize SQLite queue system:', error.message);
    }
  }
};

// Keep session alive every 2 minutes
const startKeepAlive = () => {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  
  keepAliveInterval = setInterval(async () => {
    if (client && isReady) {
      try {
        // Use getState() to check connection health
        const state = await client.getState();
        lastActivity = Date.now();
        console.log('📱 Keep-alive successful, state:', state);
        
        // Check if state indicates problem
        if (state === 'TIMEOUT' || state === 'DISCONNECTED') {
          console.log('⚠️ Keep-alive detected bad state:', state);
          await handleSessionError(`keep-alive-bad-state: ${state}`);
        }
      } catch (error) {
        console.log('⚠️ Keep-alive failed:', error.message);
        
        // Only trigger recovery for serious errors
        if (error.message.includes('Session closed') || 
            error.message.includes('Protocol error') ||
            error.message.includes('Target closed')) {
          await handleSessionError(`keep-alive-failed: ${error.message}`);
        }
      }
    }
  }, 120000); // Every 2 minutes
};

// Stop keep alive
const stopKeepAlive = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
};

// Handle session errors with auto-recovery
const handleSessionError = async (reason) => {
  console.log(`🔄 Handling session error: ${reason}`);
  
  // Prevent multiple simultaneous recovery attempts
  if (initializationStatus === 'recovering') {
    console.log('⚠️ Recovery already in progress, skipping...');
    return;
  }
  
  initializationStatus = 'recovering';
  
  try {
    if (client) {
      console.log('📱 Destroying existing client...');
      try {
        await client.destroy();
      } catch (e) {
        console.log('⚠️ Error destroying client:', e.message);
      }
      client = null;
    }
  } catch (e) {
    console.log('⚠️ Error in cleanup:', e.message);
  }
  
  isReady = false;
  qrString = '';
  stopKeepAlive();
  
  // Clear session only for authentication failures
  if (reason.includes('auth_failure') || reason.includes('LOGOUT')) {
    const sessionPath = path.join(__dirname, '..', 'whatsapp-session');
    if (fs.existsSync(sessionPath)) {
      console.log('🔄 Clearing session due to auth failure...');
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('✅ Session cleared');
      } catch (clearError) {
        console.error('❌ Failed to clear session:', clearError.message);
      }
    }
  }
  
  // Auto restart with exponential backoff
  const delay = reason.includes('auth_failure') ? 10000 : 5000; // Longer delay for auth failures
  
  setTimeout(async () => {
    try {
      console.log('🔄 Auto-recovering WhatsApp session...');
      await initializeWhatsApp();
      
      // Retry failed messages after successful recovery
      setTimeout(() => {
        if (isReady) {
          retryFailedMessages();
        }
      }, 3000);
    } catch (error) {
      console.error('❌ Auto-recovery failed:', error.message);
      initializationStatus = 'error';
      
      // Try one more time after 30 seconds
      setTimeout(async () => {
        console.log('🔄 Final recovery attempt...');
        try {
          await initializeWhatsApp();
        } catch (finalError) {
          console.error('❌ Final recovery failed:', finalError.message);
          initializationStatus = 'failed';
        }
      }, 30000);
    }
  }, delay);
};

// Retry failed messages
const retryFailedMessages = async () => {
  if (!messageQueue) return;
  
  try {
    const stats = await messageQueue.getStats();
    if (stats.failed === 0) return;
    
    console.log(`🔄 SQLite Queue has ${stats.failed} failed messages to retry`);
    
    // SQLite queue automatically retries, but we can resume processing
    if (queueProcessor && isReady) {
      queueProcessor.resume();
    }
  } catch (error) {
    console.error('❌ Failed to check queue stats:', error.message);
  }
};

const initializeWhatsApp = async () => {
  console.log('🔍 initializeWhatsApp called, current status:', initializationStatus);
  console.log('🔍 client exists:', !!client);
  console.log('🔍 isReady:', isReady);
  
  // Initialize Bull queue system first
  await initializeQueueSystem();
  
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
    });    client.on('authenticated', () => {
      console.log('✅ WhatsApp authenticated successfully');
    });

    client.on('auth_failure', (msg) => {
      console.error('❌ WhatsApp authentication failed:', msg);
      isReady = false;
      initializationStatus = 'auth_failed';
      
      // Auto-restart on auth failure
      console.log('🔄 Auto-restarting due to authentication failure...');
      setTimeout(async () => {
        await handleSessionError(`auth_failure: ${msg}`);
      }, 5000); // Wait 5 seconds before restart
    });    client.on('ready', () => {
      console.log('\n✅ =============================');
      console.log('✅   WhatsApp client is ready!');
      console.log('✅ =============================\n');
      isReady = true;
      qrString = ''; // Clear QR string when ready
      initializationStatus = 'ready';
      
      // Start keep-alive mechanism
      startKeepAlive();
      lastActivity = Date.now();
        // Start SQLite queue processor
      if (queueProcessor && !queueProcessor.isProcessing) {
        queueProcessor.start();
        console.log('🚀 SQLite queue processor started');
      }
    });    client.on('disconnected', (reason) => {
      console.log('🔌 WhatsApp client disconnected:', reason);
      isReady = false;
      qrString = '';
      initializationStatus = 'disconnected';      // Stop keep-alive and pause SQLite queue
      stopKeepAlive();
      if (queueProcessor) {
        queueProcessor.stop();
        console.log('🛑 SQLite queue processor stopped');
      }
      
      // Auto-restart based on disconnect reason
      if (reason === 'LOGOUT' || reason === 'RESTART' || reason === 'PHONE_DISCONNECTED') {
        console.log('🔄 Auto-restarting due to disconnect:', reason);
        setTimeout(async () => {
          await handleSessionError(`disconnected: ${reason}`);
        }, 3000);
      } else {
        console.log('⚠️ Disconnect reason unknown, manual restart may be needed:', reason);
        client = null; // Only set to null for unknown disconnections
      }
    });

    // Listen for state changes
    client.on('change_state', (state) => {
      console.log('📱 WhatsApp state changed to:', state);
      
      if (state === 'DISCONNECTED' || state === 'TIMEOUT') {
        console.log('🔄 Auto-restarting due to state change:', state);
        setTimeout(async () => {
          await handleSessionError(`state_change: ${state}`);
        }, 2000);
      }
    });

    // Listen for remote session events
    client.on('remote_session_saved', () => {
      console.log('💾 Remote session saved to phone');
      lastActivity = Date.now();
    });

    // Add error event handler
    client.on('error', (error) => {
      console.error('❌ WhatsApp client error:', error.message);
      initializationStatus = 'error';
      
      // Auto-restart for critical errors
      if (error.message.includes('Session closed') || 
          error.message.includes('Target closed') ||
          error.message.includes('Protocol error') ||
          error.message.includes('Navigation timeout') ||
          error.message.includes('net::ERR_')) {
        console.log('🔄 Auto-restarting due to critical error:', error.message);
        setTimeout(async () => {
          await handleSessionError(`error: ${error.message}`);
        }, 1000);
      }
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
  const getQueueStats = async () => {
    if (!messageQueue) return { total: 0, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    try {
      return await messageQueue.getStats();
    } catch (error) {
      return { total: 0, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, error: error.message };
    }
  };
  
  const getProcessorStats = async () => {
    if (!queueProcessor) return { isProcessing: false };
    try {
      return await queueProcessor.getStats();
    } catch (error) {
      return { isProcessing: false, error: error.message };
    }
  };
  
  Promise.all([getQueueStats(), getProcessorStats()])
    .then(([queueStats, processorStats]) => {
      res.json({ 
        isReady,
        status: initializationStatus,
        hasQR: !!qrString,
        clientExists: !!client,
        lastActivity: new Date(lastActivity).toISOString(),
        keepAliveActive: !!keepAliveInterval,
        uptime: Date.now() - lastActivity,
        queue: queueStats,
        processor: processorStats,
        message: isReady ? 'WhatsApp is connected' : `WhatsApp is not connected (${initializationStatus})`
      });
    })
    .catch(error => {
      res.json({ 
        isReady,
        status: initializationStatus,
        hasQR: !!qrString,
        clientExists: !!client,
        lastActivity: new Date(lastActivity).toISOString(),
        keepAliveActive: !!keepAliveInterval,
        uptime: Date.now() - lastActivity,
        queue: { error: error.message },
        processor: { error: error.message },
        message: isReady ? 'WhatsApp is connected' : `WhatsApp is not connected (${initializationStatus})`
      });
    });
};

const sendMessage = async (req, res) => {
  try {
    const { number, message, priority = 'NORMAL' } = req.body;
    
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
    console.log('📱 Priority:', priority);
    
    // Update last activity
    lastActivity = Date.now();
    
    // Create unique message ID
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize Bull queue system if not already done
    if (!messageQueue) {
      await initializeQueueSystem();
    }
      if (!messageQueue) {
      return res.status(503).json({ 
        success: false,
        message: 'Queue system not available. Check database connection.',
        messageId: messageId
      });
    }
    
    try {
      // Add message to SQLite queue
      const queueResult = await messageQueue.addMessage({
        chatId,
        message,
        formattedNumber,
        originalNumber: number,
        priority
      }, { messageId });
      
      // SQLite queue handles processing automatically
      res.status(202).json({ 
        success: true,
        message: 'Message queued for delivery',
        messageId: messageId,
        jobId: queueResult.jobId,
        to: formattedNumber,
        status: queueResult.status,
        priority: priority,
        delivery: 'queued'
      });
      
    } catch (queueError) {
      console.error('❌ Failed to queue message:', queueError.message);
      res.status(500).json({ 
        success: false,
        message: 'Failed to queue message',
        error: queueError.message
      });
    }
    
  } catch (error) {
    console.error('❌ Send message error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process message', 
      error: error.message 
    });
  }
};

const resetSession = async (req, res) => {
  try {
    console.log('🔄 Resetting WhatsApp session...');
    
    // Stop keep-alive and pause Bull queue first
    stopKeepAlive();
    if (queueProcessor) {
      await queueProcessor.stop();
      console.log('🛑 Bull queue processor paused');
    }
    
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
    
    // Get queue stats before reset
    let queueStats = { total: 0 };
    try {
      if (messageQueue) {
        queueStats = await messageQueue.getStats();
      }
    } catch (error) {
      console.log('⚠️ Failed to get queue stats:', error.message);
    }
      res.json({ 
      success: true, 
      message: 'Session reset successfully. SQLite queue preserved for retry after reconnection.',
      queueStats: queueStats
    });
    
    // Delete session folder
    const sessionPath = path.join(__dirname, '..', 'whatsapp-session');
    console.log('📱 Deleting session folder:', sessionPath);
    
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log('✅ Session folder deleted');
    }
    
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
  // Export queue functions for routes
  getMessageQueue: () => messageQueue,
  getQueueProcessor: () => queueProcessor,
  // Export untuk digunakan di routes
  get qrString() { return qrString; },
  get isReady() { return isReady; },
  get initializationStatus() { return initializationStatus; }
};
