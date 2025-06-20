const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sequelize = require('./config/database');
const { initializeWhatsApp } = require('./controllers/whatsappController');
require('dotenv').config();

const app = express();

// Setup multer untuk handle form-data (global)
const upload = multer();

// Middleware - PENTING: Order middleware sangat penting!
app.use(cors());

// Body parser middleware - support semua format
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Multer middleware global untuk form-data
app.use(upload.none());

// Debug middleware untuk melihat request body
app.use((req, res, next) => {
    console.log(`📝 ${req.method} ${req.path}`);
    if (req.method === 'POST' && req.body) {

        // Log body tapi hide password
        const logBody = { ...req.body };
        if (logBody.password) logBody.password = '[HIDDEN]';
    }
    next();
});

// Routes dengan error handling
console.log('📋 Registering routes...');
try {
    const authRoutes = require('./routes/auth');
    const whatsappRoutes = require('./routes/whatsapp');

    app.use('/api/auth', authRoutes);
    app.use('/api/whatsapp', whatsappRoutes);

    console.log('✅ Auth routes registered: /api/auth');
    console.log('✅ WhatsApp routes registered: /api/whatsapp');
} catch (error) {
    console.error('❌ Error registering routes:', error.message);
    console.error(error.stack);
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ message: 'WhatsApp API is running' });
});

// Test endpoint untuk debugging
app.post('/api/test', (req, res) => {
    console.log('🧪 Test endpoint hit');
    console.log('🧪 Headers:', req.headers);
    console.log('🧪 Body:', req.body);
    res.json({
        message: 'Test endpoint',
        body: req.body,
        headers: req.headers
    });
});

// Catch all untuk routes yang tidak ditemukan
app.use('*', (req, res) => {
    res.status(404).json({
        message: 'Route not found',
        path: req.originalUrl,
        method: req.method,
        availableRoutes: [
            'GET /api/health',
            'POST /api/test',
            'POST /api/auth/login',
            'POST /api/auth/refresh-token',
            'POST /api/auth/logout',
            'GET /api/whatsapp/status',
            'GET /api/whatsapp/qr',
            'GET /api/whatsapp/qr-page',
            'POST /api/whatsapp/send-message',
            'POST /api/whatsapp/reset-session'
        ]
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Server Error:', error.message);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    console.log('\n=============================');
    console.log('  🚀 Starting WhatsApp API');
    console.log('=============================');

    try {
        // Step 1: Database Connection
        console.log('📊 Connecting to database...');
        await sequelize.authenticate();
        console.log('✅ Database connected successfully');

        // Step 2: Database Sync
        console.log('🔄 Syncing database...');
        await sequelize.sync();
        console.log('✅ Database synced successfully');

        // Step 3: Start HTTP Server
        console.log('🌐 Starting HTTP server...');
        const server = app.listen(PORT, () => {
            console.log('✅ HTTP server started successfully');
            console.log('\n=============================');
            console.log('  📱 WhatsApp API Server Ready');
            console.log('=============================');
            console.log(`🚀 Server running on:`);
            console.log(`   Local:    http://localhost:${PORT}`);
            console.log(`   Network:  http://127.0.0.1:${PORT}`);
            console.log('');
            console.log('📝 Available Routes:');
            console.log(`   Health:   GET  http://localhost:${PORT}/api/health`);
            console.log(`   Login:    POST http://localhost:${PORT}/api/auth/login`);
            console.log(`   Refresh:  POST http://localhost:${PORT}/api/auth/refresh-token`);
            console.log(`   Logout:   POST http://localhost:${PORT}/api/auth/logout`);
            console.log(`   Status:   GET  http://localhost:${PORT}/api/whatsapp/status`);
            console.log(`   QR Code:  GET  http://localhost:${PORT}/api/whatsapp/qr`);
            console.log(`   QR Page:  GET  http://localhost:${PORT}/api/whatsapp/qr-page`);
            console.log(`   Send:     POST http://localhost:${PORT}/api/whatsapp/send-message`);
            console.log(`   Reset:    POST http://localhost:${PORT}/api/whatsapp/reset-session`);
            console.log('');
            console.log('📱 Login Credentials:');
            console.log('   Email:    siaokebpa@gmail.com');
            console.log('   Password: random123456');
            console.log('=============================');
            
            // Step 4: Initialize WhatsApp immediately after server starts
            console.log('\n🔄 Initializing WhatsApp client...');
            console.log('💡 This may take a few moments...');
            
            // Immediate initialization
            initializeWhatsApp()
                .then(() => {
                    console.log('✅ WhatsApp initialization completed');
                    console.log('💡 If you need QR code, check the logs above');
                    console.log('💡 Or visit: http://localhost:3000/api/whatsapp/qr-page');
                    console.log('💡 Status: GET http://localhost:3000/api/whatsapp/status\n');
                })
                .catch((error) => {
                    console.error('❌ Failed to initialize WhatsApp:', error.message);
                    console.error('💡 You can try again with: POST /api/whatsapp/reset-session');
                    console.error('💡 Or restart the server');
                });
        });

    } catch (error) {
        console.error('\n❌ Failed to start server:');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
};

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n\n=============================');
    console.log('  🛑 Shutting down server...');
    console.log('=============================');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n=============================');
    console.log('  🛑 Server terminated');
    console.log('=============================');
    process.exit(0);
});

startServer();
