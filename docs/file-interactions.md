# WhatsApp API - File-to-File Flow Architecture

## 📁 Project Structure & File Interactions

```
siakoberpa/
├── server.js                          # 🚀 Entry Point
├── config/
│   └── database.js                     # 🗄️ Database Connection
├── models/
│   ├── User.js                         # 👤 User Model
│   └── MessageJob.js                   # 📨 Message Queue Model
├── controllers/
│   ├── authController.js               # 🔐 Authentication Logic
│   └── whatsappController.js           # 📱 WhatsApp Logic
├── middleware/
│   └── auth.js                         # 🛡️ JWT Verification
├── routes/
│   ├── auth.js                         # 🛣️ Auth Routes
│   └── whatsapp.js                     # 🛣️ WhatsApp Routes
├── utils/
│   ├── sqliteMessageQueue.js           # 📊 Queue Management
│   └── sqliteQueueProcessor.js         # ⚙️ Job Processing
└── docs/                               # 📚 Documentation
```

## 🔄 Complete File Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          HTTP REQUEST FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

 HTTP Request
      │
      ▼
┌─────────────┐
│  server.js  │ ◄──── Entry point, Express setup
└─────────────┘
      │
      │ require routes
      ▼
┌─────────────┐    ┌─────────────┐
│/routes/     │    │/routes/     │
│auth.js      │    │whatsapp.js  │
└─────────────┘    └─────────────┘
      │                    │
      │ require middleware │ require middleware
      ▼                    ▼
┌─────────────┐    ┌─────────────┐
│/middleware/ │    │/middleware/ │
│auth.js      │    │auth.js      │
└─────────────┘    └─────────────┘
      │                    │
      │ JWT verified       │ JWT verified
      ▼                    ▼
┌─────────────┐    ┌─────────────┐
│/controllers/│    │/controllers/│
│authController│    │whatsappCtrl │
└─────────────┘    └─────────────┘
      │                    │
      │ use models         │ use utils & models
      ▼                    ▼
┌─────────────┐    ┌─────────────┐
│/models/     │    │/utils/      │
│User.js      │    │sqliteQueue  │
└─────────────┘    └─────────────┘
      │                    │
      │ use database       │ use models
      ▼                    ▼
┌─────────────┐    ┌─────────────┐
│/config/     │    │/models/     │
│database.js  │    │MessageJob.js│
└─────────────┘    └─────────────┘
                           │
                           │ use database
                           ▼
                   ┌─────────────┐
                   │/config/     │
                   │database.js  │
                   └─────────────┘
```

## 🔐 Authentication Flow (File Interactions)

```
POST /api/auth/login
│
├── server.js
│   └── app.use('/api/auth', authRoutes)
│
├── /routes/auth.js
│   ├── router.post('/login', authController.login)
│   └── require('../controllers/authController')
│
├── /controllers/authController.js
│   ├── const User = require('../models/User')
│   ├── const bcrypt = require('bcryptjs')
│   ├── const jwt = require('jsonwebtoken')
│   └── login() function
│
├── /models/User.js
│   ├── const sequelize = require('../config/database')
│   ├── User.findOne({ where: { email } })
│   └── User model definition
│
└── /config/database.js
    ├── const { Sequelize } = require('sequelize')
    └── SQLite connection setup
```

## 📱 WhatsApp Message Flow (File Interactions)

```
POST /api/whatsapp/send-message
│
├── server.js
│   └── app.use('/api/whatsapp', whatsappRoutes)
│
├── /routes/whatsapp.js
│   ├── const verifyToken = require('../middleware/auth')
│   ├── const { sendMessage } = require('../controllers/whatsappController')
│   └── router.post('/send-message', verifyToken, sendMessage)
│
├── /middleware/auth.js
│   ├── const jwt = require('jsonwebtoken')
│   ├── Verify JWT token
│   └── next() or 401 error
│
├── /controllers/whatsappController.js
│   ├── const SQLiteMessageQueue = require('../utils/sqliteMessageQueue')
│   ├── const SQLiteQueueProcessor = require('../utils/sqliteQueueProcessor')
│   ├── sendMessage() function
│   └── messageQueue.addMessage()
│
├── /utils/sqliteMessageQueue.js
│   ├── const MessageJob = require('../models/MessageJob')
│   ├── addMessage() method
│   └── MessageJob.create()
│
├── /models/MessageJob.js
│   ├── const sequelize = require('../config/database')
│   ├── MessageJob model definition
│   └── Database operations
│
└── /config/database.js
    └── SQLite database connection
```

## ⚙️ Background Queue Processing (File Interactions)

```
Queue Processor Background Job
│
├── /controllers/whatsappController.js
│   ├── initializeQueueSystem()
│   ├── queueProcessor = new SQLiteQueueProcessor()
│   └── queueProcessor.start()
│
├── /utils/sqliteQueueProcessor.js
│   ├── const EventEmitter = require('events')
│   ├── processQueue() method every 5 seconds
│   ├── this.sqliteQueue.getJobsForProcessing()
│   └── processJob() for each job
│
├── /utils/sqliteMessageQueue.js
│   ├── getJobsForProcessing() method
│   ├── markJobAsActive()
│   ├── markJobAsCompleted()
│   └── markJobAsFailed()
│
├── /models/MessageJob.js
│   ├── getJobsForProcessing() static method
│   ├── markAsActive() instance method
│   ├── markAsCompleted() instance method
│   ├── incrementAttempts() with backoff
│   └── SQL queries to update job status
│
└── /config/database.js
    └── Execute SQL operations
```

## 🔄 Session Management Flow (File Interactions)

```
WhatsApp Session Events
│
├── /controllers/whatsappController.js
│   ├── const { Client, LocalAuth } = require('whatsapp-web.js')
│   ├── initializeWhatsApp()
│   ├── client.on('ready') ──────┐
│   ├── client.on('disconnected') │
│   ├── client.on('auth_failure') │
│   └── handleSessionError() ────┤
│                                │
├── Auto-Recovery Logic ◄────────┘
│   ├── startKeepAlive()
│   ├── stopKeepAlive() 
│   └── Queue processor start/stop
│
├── /utils/sqliteQueueProcessor.js
│   ├── start() method
│   ├── stop() method
│   └── processQueue() continues/pauses
│
└── /utils/sqliteMessageQueue.js
    ├── pauseQueue()
    ├── resumeQueue()
    └── Job status management
```

## 🗄️ Database Layer Flow

```
Database Operations Flow
│
├── /config/database.js
│   ├── Sequelize SQLite setup
│   ├── Connection configuration
│   └── Export sequelize instance
│
├── /models/User.js
│   ├── Import sequelize from config
│   ├── Define User model
│   ├── Authentication methods
│   └── JWT token operations
│
├── /models/MessageJob.js
│   ├── Import sequelize from config
│   ├── Define MessageJob model
│   ├── Queue management methods:
│   │   ├── getJobsForProcessing()
│   │   ├── getStats()
│   │   ├── cleanOldJobs()
│   │   ├── pauseAll() / resumeAll()
│   │   └── clearAll()
│   ├── Instance methods:
│   │   ├── canRetry()
│   │   ├── markAsActive()
│   │   ├── markAsCompleted()
│   │   ├── markAsFailed()
│   │   ├── incrementAttempts()
│   │   └── updateProgress()
│   └── Database indexes for performance
│
└── server.js
    ├── require('./models/User')
    ├── require('./models/MessageJob')
    ├── sequelize.authenticate()
    └── Auto-sync database schema
```

## 🛣️ API Routes Structure

```
Request Routing Flow
│
├── server.js
│   ├── app.use('/api/auth', authRoutes)
│   ├── app.use('/api/whatsapp', whatsappRoutes)
│   └── Error handling middleware
│
├── /routes/auth.js
│   ├── POST /login ──────► authController.login
│   ├── POST /refresh ────► authController.refreshToken
│   └── POST /logout ─────► authController.logout
│
└── /routes/whatsapp.js
    ├── GET  /qr ─────────► whatsappController.getQRCode
    ├── GET  /status ─────► whatsappController.getStatus
    ├── POST /send-message ► whatsappController.sendMessage
    ├── POST /reset-session ► whatsappController.resetSession
    ├── GET  /retry-queue ─► Queue status endpoint
    ├── POST /queue/clear ─► Queue management
    ├── POST /queue/config ► Queue configuration
    └── ... other queue endpoints
```

## 📊 Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPLETE DATA FLOW                          │
└─────────────────────────────────────────────────────────────────┘

HTTP Request
    │
    ▼
server.js (Express setup)
    │
    ▼
/routes/*.js (Route definitions)
    │
    ▼
/middleware/auth.js (JWT verification)
    │
    ▼
/controllers/*.js (Business logic)
    │
    ├─────────────────────┐
    ▼                     ▼
/models/*.js         /utils/*.js
(Database ORM)       (Queue system)
    │                     │
    ▼                     ▼
/config/database.js  /models/MessageJob.js
(SQLite connection)  (Queue persistence)
    │                     │
    └─────────┬───────────┘
              ▼
          SQLite Database
       (users + message_jobs)
```

## 🕸️ Complete File Dependency Web

```
                    📁 siakoberpa/ (Project Root)
                             │
                    ┌────────┼────────┐
                    │        │        │
               📦 package.json    🔧 .env    📋 README.md
                    │        │        │
                    │   ┌────▼────┐   │
                    │   │🚀server.js│  │
                    │   │(MAIN)     │  │
                    │   └────┬────┘   │
                    │        │        │
           ┌────────┼────────┼────────┼────────┐
           │        │        │        │        │
      📁config/  📁models/ 📁routes/ 📁controllers/ 📁middleware/
           │        │        │        │        │
      🔌database.js │   🛣️auth.js  🔐authCtrl  🛡️auth.js
           │    👤User.js   🛣️whatsapp 📱waCtrl      │
           │  📨MessageJob     │        │        │
           │        │        │        │        │
           └────────┼────────┼────────┼────────┘
                    │        │        │
                    │        │   📁utils/
                    │        │        │
                    │        │   📊sqliteQueue
                    │        │   ⚙️queueProcessor
                    │        │        │
                    └────────┼────────┘
                             │
                        💾 SQLite DB
                      (users + message_jobs)
```

## 🔗 Import/Export Relationships

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        📥 IMPORT DEPENDENCIES                          │
└─────────────────────────────────────────────────────────────────────────┘

🚀 server.js
├── 📦 require('express')
├── 📦 require('cors') 
├── 📦 require('dotenv')
├── 🔌 require('./config/database')
├── 👤 require('./models/User')
├── 📨 require('./models/MessageJob')  
├── 🛣️ require('./routes/auth')
├── 🛣️ require('./routes/whatsapp')
└── 📱 require('./controllers/whatsappController').initializeWhatsApp

🔌 config/database.js
├── 📦 require('sequelize')
└── 📦 require('sqlite3')

👤 models/User.js
├── 📦 require('sequelize').DataTypes
└── 🔌 require('../config/database')

📨 models/MessageJob.js  
├── 📦 require('sequelize').DataTypes
└── 🔌 require('../config/database')

🛡️ middleware/auth.js
├── 📦 require('jsonwebtoken')  
└── 👤 require('../models/User')

🔐 controllers/authController.js
├── 📦 require('bcryptjs')
├── 📦 require('jsonwebtoken')
└── 👤 require('../models/User')

📱 controllers/whatsappController.js
├── 📦 require('whatsapp-web.js')
├── 📦 require('qrcode')
├── 📦 require('path')
├── 📦 require('fs')
├── 📊 require('../utils/sqliteMessageQueue')
└── ⚙️ require('../utils/sqliteQueueProcessor')

🛣️ routes/auth.js
├── 📦 require('express')
├── 🛡️ require('../middleware/auth')
└── 🔐 require('../controllers/authController')

🛣️ routes/whatsapp.js  
├── 📦 require('express')
├── 🛡️ require('../middleware/auth')
└── 📱 require('../controllers/whatsappController')

📊 utils/sqliteMessageQueue.js
├── 📨 require('../models/MessageJob')
└── 📦 require('sequelize').Op

⚙️ utils/sqliteQueueProcessor.js
├── 📦 require('events')
└── 📊 (uses sqliteMessageQueue instance)
```

## 🎯 Function Call Chain Examples

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      🔄 FUNCTION CALL CHAINS                           │
└─────────────────────────────────────────────────────────────────────────┘

🔐 LOGIN REQUEST CHAIN:
POST /api/auth/login
    │
    ├── server.js (Express router)
    │   └── app.use('/api/auth', authRoutes)
    │
    ├── routes/auth.js  
    │   └── router.post('/login', verifyToken, authController.login)
    │
    ├── middleware/auth.js (optional for login)
    │   ├── jwt.verify(token)
    │   └── User.findByPk(decoded.userId)
    │
    ├── controllers/authController.js
    │   ├── login(req, res) function
    │   ├── User.findOne({ where: { email } })
    │   ├── bcrypt.compare(password, user.password)
    │   ├── jwt.sign({ userId: user.id })
    │   └── res.json({ token, user })
    │
    └── models/User.js
        ├── User.findOne() → Sequelize query
        └── config/database.js → SQLite execution

📱 SEND MESSAGE CHAIN:
POST /api/whatsapp/send-message
    │
    ├── server.js (Express router)
    │   └── app.use('/api/whatsapp', whatsappRoutes)
    │
    ├── routes/whatsapp.js
    │   └── router.post('/send-message', verifyToken, sendMessage)
    │
    ├── middleware/auth.js  
    │   ├── jwt.verify(token)
    │   ├── User.findByPk(decoded.userId)
    │   └── req.user = user; next()
    │
    ├── controllers/whatsappController.js
    │   ├── sendMessage(req, res) function
    │   ├── Validate & format phone number
    │   ├── messageQueue.addMessage(messageData)
    │   └── res.json({ success: true, queued: true })
    │
    ├── utils/sqliteMessageQueue.js
    │   ├── addMessage() method
    │   ├── MessageJob.create(jobData)
    │   └── Return job info
    │
    └── models/MessageJob.js
        ├── MessageJob.create() → Sequelize insert
        └── config/database.js → SQLite execution

⚙️ BACKGROUND PROCESSING CHAIN:
Queue Processor (every 5 seconds)
    │
    ├── utils/sqliteQueueProcessor.js
    │   ├── processQueue() method
    │   ├── sqliteQueue.getJobsForProcessing(3)
    │   ├── For each job: processJob(job)
    │   └── Handle success/error
    │
    ├── utils/sqliteMessageQueue.js
    │   ├── getJobsForProcessing() method  
    │   ├── MessageJob.getJobsForProcessing()
    │   └── Return ready jobs array
    │
    ├── models/MessageJob.js
    │   ├── getJobsForProcessing() static method
    │   ├── Sequelize query with conditions
    │   ├── markAsActive(), markAsCompleted(), etc.
    │   └── Database updates
    │
    └── WhatsApp Client (external)
        ├── client.getContactById(chatId)  
        ├── client.sendMessage(chatId, message)
        └── Return sent message info
```

## 📊 Data Flow Between Files

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        📊 DATA FLOW DIAGRAM                            │
└─────────────────────────────────────────────────────────────────────────┘

🎯 USER DATA:
Client JSON ──► routes/auth.js ──► authController.js ──► models/User.js ──► SQLite
                                  │                       │
                                  └── JWT Token ──────────┘ ──► Client Response

📨 MESSAGE DATA:
Client JSON ──► routes/whatsapp.js ──► whatsappController.js ──► sqliteMessageQueue.js ──► MessageJob.js ──► SQLite
                                      │                          │
                                      └── Queue Response ───────┘ ──► Client Response

⚙️ PROCESSING DATA:
SQLite ──► MessageJob.js ──► sqliteQueueProcessor.js ──► WhatsApp Client ──► External API
   │                           │                            │
   └── Job Updates ────────────┘ ──► Success/Error ─────────┘ ──► SQLite (via MessageJob.js)

🔄 SESSION DATA:
WhatsApp Client ──► whatsappController.js ──► File System (session folder)
                   │                          │
                   └── Events/Status ─────────┘ ──► Queue Processor Control
```

## 🏗️ Module Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      🏗️ LAYERED ARCHITECTURE                           │  
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     🌐 PRESENTATION LAYER                              │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│ │🛣️routes/    │  │🛡️middleware/│  │📁public/    │  │📚docs/      │    │
│ │auth.js      │  │auth.js      │  │(static)     │  │*.md         │    │
│ │whatsapp.js  │  │             │  │             │  │             │    │
│ └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     🧠 BUSINESS LOGIC LAYER                            │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│ │🔐controllers│  │📊utils/     │  │⚙️utils/     │  │🔧config/    │    │
│ │authCtrl.js  │  │sqliteQueue  │  │queueProc.js │  │database.js  │    │
│ │whatsappCtrl │  │             │  │             │  │             │    │
│ └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      💾 DATA ACCESS LAYER                              │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│ │📨models/    │  │👤models/    │  │🔌config/    │  │💾SQLite     │    │
│ │MessageJob   │  │User.js      │  │database.js  │  │Database     │    │
│ │             │  │             │  │             │  │             │    │
│ └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    🚀 APPLICATION ENTRY POINT                          │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                        server.js                                    │ │
│ │        ├── Express Setup   ├── Database Init   ├── Route Setup      │ │
│ │        └── WhatsApp Init   └── Error Handling  └── Server Start     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

Dokumentasi ini memberikan gambaran lengkap tentang bagaimana setiap file saling berinteraksi dalam sistem WhatsApp API! 🚀