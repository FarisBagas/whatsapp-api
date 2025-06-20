# WhatsApp API - Quick Reference

## 📋 API Endpoints Summary

### Authentication
```
POST /api/auth/login          - Login and get JWT token
POST /api/auth/refresh-token  - Refresh expired token
POST /api/auth/logout         - Logout and invalidate token
```

### WhatsApp Operations
```
GET  /api/whatsapp/qr         - Get QR code for authentication
GET  /api/whatsapp/status     - Get WhatsApp connection status
POST /api/whatsapp/send-message - Send message (with priority)
POST /api/whatsapp/reset-session - Reset WhatsApp session
```

### Queue Management
```
GET  /api/whatsapp/retry-queue       - View message queue
POST /api/whatsapp/queue/clear       - Clear all queued messages
POST /api/whatsapp/queue/clean       - Clean old completed jobs
POST /api/whatsapp/queue/pause       - Pause queue processing
POST /api/whatsapp/queue/resume      - Resume queue processing
POST /api/whatsapp/queue/retry/:id   - Retry specific job
GET  /api/whatsapp/queue/job/:id     - Get job details
POST /api/whatsapp/queue/config      - Update queue configuration
```

## 🔧 Configuration Options

### Environment Variables
```bash
# Server
PORT=3000

# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=whatsapp_api

# JWT
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
```

### Queue Configuration
```json
{
  "concurrency": 3,           // Max concurrent jobs (1-10)
  "processInterval": 5000,    // Process every 5 seconds
  "stalledTimeout": 300000    // 5 minutes stalled timeout
}
```

## 📊 Response Format Examples

### Send Message Success
```json
{
  "success": true,
  "message": "Message queued for delivery",
  "messageId": "msg_1234567890_abc123",
  "jobId": "job_1234567890_def456",
  "to": "6282126611394",
  "status": "waiting",
  "priority": "NORMAL",
  "delivery": "queued"
}
```

### Queue Status
```json
{
  "queueSize": 15,
  "waiting": 12,
  "active": 2,
  "completed": 1,
  "failed": 0,
  "delayed": 0,
  "messages": [...],
  "stats": {...}
}
```

### System Status
```json
{
  "isReady": true,
  "status": "ready",
  "hasQR": false,
  "clientExists": true,
  "lastActivity": "2024-01-20T10:30:00.000Z",
  "keepAliveActive": true,
  "uptime": 3600000,
  "queue": {
    "total": 15,
    "waiting": 12,
    "active": 2,
    "completed": 1,
    "failed": 0
  },
  "message": "WhatsApp is connected"
}
```

## 🚀 Quick Start Commands

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Initialize Database
```bash
npm run db:setup
```

### 4. Start Server
```bash
npm start
# or for development
npm run dev
```

### 5. Get QR Code
```bash
curl -H "Authorization: Bearer YOUR_JWT" \
     http://localhost:3000/api/whatsapp/qr
```

### 6. Send Message
```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_JWT" \
     -H "Content-Type: application/json" \
     -d '{"number":"628123456789","message":"Hello World","priority":"HIGH"}' \
     http://localhost:3000/api/whatsapp/send-message
```

## 🔍 Troubleshooting

### Common Issues & Solutions

1. **WhatsApp not connecting**
   - Check QR code endpoint
   - Ensure phone has internet
   - Reset session if needed

2. **Messages not sending**
   - Check queue status
   - Verify number format (62xxx)
   - Check if number is registered on WhatsApp

3. **Queue stuck**
   - Check queue processor status
   - Manually trigger processing
   - Restart queue processor

4. **High retry attempts**
   - Check WhatsApp session health
   - Verify internet connection
   - Check for rate limiting

### Debug Commands
```bash
# Check queue status
curl -H "Authorization: Bearer JWT" http://localhost:3000/api/whatsapp/retry-queue

# Check system status  
curl -H "Authorization: Bearer JWT" http://localhost:3000/api/whatsapp/status

# Manual queue processing
curl -X POST -H "Authorization: Bearer JWT" http://localhost:3000/api/whatsapp/queue/process

# Reset WhatsApp session
curl -X POST -H "Authorization: Bearer JWT" http://localhost:3000/api/whatsapp/reset-session
```

## 📈 Performance Tips

1. **Optimize Concurrency**
   - Start with 3 concurrent jobs
   - Increase based on system capacity
   - Monitor for rate limiting

2. **Queue Maintenance**
   - Clean old jobs regularly
   - Monitor queue size
   - Set appropriate retry limits

3. **Database Optimization**
   - Regular VACUUM for SQLite
   - Monitor database size
   - Archive old completed jobs

4. **Session Management**
   - Keep session alive
   - Monitor for disconnections
   - Implement proper error handling