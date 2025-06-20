# WhatsApp API - Detailed Logic Flow Explanation

## 🧠 Logic Flow Inside Each File

### 🚀 server.js - Application Bootstrap Logic

```javascript
// STARTUP SEQUENCE LOGIC:
1. Load environment variables (.env file)
2. Create Express app instance
3. Setup middleware (CORS, JSON parser, etc.)
4. Connect to database (SQLite)
5. Register models (User, MessageJob)
6. Setup API routes (/api/auth, /api/whatsapp)
7. Initialize WhatsApp system
8. Start HTTP server on specified port

// ERROR HANDLING LOGIC:
- Global error handler for unhandled promise rejections
- Database connection error handling
- Graceful shutdown on SIGTERM/SIGINT
```

### 📱 whatsappController.js - Core WhatsApp Logic

#### 🔄 initializeWhatsApp() - Main Initialization Logic

```javascript
LOGIC FLOW:
┌─────────────────────────────────────────────────────────────────┐
│ 1. CHECK: Is client already initialized?                       │
│    ├── YES: Return early (avoid duplicate initialization)      │
│    └── NO: Continue with initialization                        │
│                                                                 │
│ 2. CREATE WhatsApp Client:                                     │
│    ├── Setup puppeteer with specific browser args              │
│    ├── Configure LocalAuth for session persistence             │
│    ├── Set session path: ./whatsapp-session/                   │
│    └── Apply anti-detection measures                           │
│                                                                 │
│ 3. SETUP EVENT LISTENERS:                                      │
│    ├── 'qr' → Generate QR code for phone scanning              │
│    ├── 'ready' → Mark as ready, start queue processor          │
│    ├── 'authenticated' → Session established successfully      │
│    ├── 'auth_failure' → Handle authentication failures         │
│    ├── 'disconnected' → Trigger auto-recovery logic            │
│    └── 'loading_screen' → Show loading progress                │
│                                                                 │
│ 4. INITIALIZE CLIENT:                                          │
│    ├── client.initialize() - Start WhatsApp connection         │
│    ├── Wait for QR code or authentication                      │
│    └── Handle any initialization errors                        │
│                                                                 │
│ 5. SETUP QUEUE SYSTEM:                                         │
│    ├── Initialize SQLite message queue                         │
│    ├── Create queue processor instance                         │
│    └── Setup event listeners for queue events                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 💓 Keep-Alive Mechanism Logic

```javascript
WHY KEEP-ALIVE IS NEEDED:
- WhatsApp Web sessions can timeout after inactivity
- Prevent automatic disconnection
- Maintain connection health
- Detect session problems early

HOW IT WORKS:

startKeepAlive() LOGIC:
┌─────────────────────────────────────────────────────────────────┐
│ 1. SET INTERVAL: Every 30 seconds                              │
│                                                                 │
│ 2. HEALTH CHECK SEQUENCE:                                      │
│    ├── Check if client exists and is ready                     │
│    ├── Calculate time since last activity                      │
│    ├── If inactive > 5 minutes:                                │
│    │   ├── Send ping to WhatsApp servers                       │
│    │   ├── Try to get client info                              │
│    │   └── Update lastActivity timestamp                       │
│    └── If ping fails:                                          │
│        ├── Log warning about potential connection issue        │
│        ├── Try to refresh session                              │
│        └── If multiple failures, trigger auto-recovery         │
│                                                                 │
│ 3. SESSION VALIDATION:                                         │
│    ├── Check if session files still exist                      │
│    ├── Validate session integrity                              │
│    └── Preemptively detect corruption                          │
│                                                                 │
│ 4. QUEUE HEALTH CHECK:                                         │
│    ├── Ensure queue processor is still running                 │
│    ├── Check for stalled jobs                                  │
│    └── Resume processing if paused                             │
└─────────────────────────────────────────────────────────────────┘

stopKeepAlive() LOGIC:
- Clear the interval timer
- Stop health monitoring
- Called during shutdown or reset
```

#### 🏥 Auto-Recovery Logic

```javascript
handleSessionError(reason) LOGIC:
┌─────────────────────────────────────────────────────────────────┐
│ WHEN TRIGGERED:                                                 │
│ - WhatsApp disconnection events                                │
│ - Authentication failures                                       │
│ - Session corruption detection                                  │
│ - Keep-alive ping failures                                     │
│                                                                 │
│ RECOVERY SEQUENCE:                                              │
│ 1. IMMEDIATE ACTIONS:                                           │
│    ├── Stop keep-alive monitoring                              │
│    ├── Pause queue processor                                   │
│    ├── Mark system as not ready                                │
│    └── Log the error reason                                    │
│                                                                 │
│ 2. SESSION CLEANUP:                                             │
│    ├── Destroy current client instance                         │
│    ├── Clear session variables                                 │
│    ├── Reset connection status                                 │
│    └── Preserve message queue (important!)                     │
│                                                                 │
│ 3. DECISION LOGIC:                                              │
│    ├── Is this a recoverable error?                            │
│    │   ├── YES: Schedule automatic restart                     │
│    │   └── NO: Wait for manual intervention                    │
│    │                                                           │
│    ├── How many recovery attempts so far?                      │
│    │   ├── < 3 attempts: Try immediate restart                 │
│    │   ├── 3-5 attempts: Wait 30 seconds before restart       │
│    │   └── > 5 attempts: Wait for manual reset                │
│    │                                                           │
│    └── What type of error occurred?                            │
│        ├── AUTH_FAILURE: Delete session, require new QR       │
│        ├── DISCONNECTED: Try reconnect with existing session  │
│        ├── LOGOUT: Clear session, start fresh                 │
│        └── UNKNOWN: Conservative approach, manual reset        │
│                                                                 │
│ 4. RESTART SEQUENCE:                                            │
│    ├── Wait for specified delay                                │
│    ├── Call initializeWhatsApp() again                         │
│    ├── Monitor for successful reconnection                     │
│    └── Resume queue processing when ready                      │
└─────────────────────────────────────────────────────────────────┘
```

### 📊 sqliteMessageQueue.js - Queue Management Logic

#### ➕ addMessage() Logic

```javascript
addMessage(messageData, options) LOGIC:
┌─────────────────────────────────────────────────────────────────┐
│ 1. INPUT VALIDATION:                                            │
│    ├── Check required fields (chatId, message, phone number)   │
│    ├── Validate phone number format                            │
│    ├── Set default priority if not specified                   │
│    └── Generate unique message ID and job ID                   │
│                                                                 │
│ 2. DELAY CALCULATION:                                           │
│    ├── If delay specified: status = 'delayed'                  │
│    ├── If no delay: status = 'waiting'                         │
│    ├── Calculate nextRetry timestamp                           │
│    └── Apply priority ordering                                 │
│                                                                 │
│ 3. DATABASE INSERTION:                                          │
│    ├── Create MessageJob record in SQLite                      │
│    ├── Set initial attempts = 0                                │
│    ├── Set maxAttempts = 5 (configurable)                      │
│    ├── Store all message metadata                              │
│    └── Handle database errors gracefully                       │
│                                                                 │
│ 4. RESPONSE FORMATION:                                          │
│    ├── Return job ID for tracking                              │
│    ├── Return message ID for client reference                  │
│    ├── Return current status                                   │
│    └── Include priority information                            │
└─────────────────────────────────────────────────────────────────┘
```

#### 📊 getJobsForProcessing() Logic

```javascript
getJobsForProcessing(limit) LOGIC:
┌─────────────────────────────────────────────────────────────────┐
│ 1. QUERY CONDITIONS:                                            │
│    ├── status = 'waiting' (ready to process)                   │
│    ├── nextRetry <= current timestamp (delay expired)          │
│    ├── attempts < maxAttempts (still retryable)                │
│    └── Not currently being processed                           │
│                                                                 │
│ 2. SORTING LOGIC:                                               │
│    ├── PRIMARY: By priority (HIGH → NORMAL → LOW)              │
│    ├── SECONDARY: By creation time (FIFO within priority)      │
│    ├── TERTIARY: By attempts (fewer attempts first)            │
│    └── Apply LIMIT to prevent overload                         │
│                                                                 │
│ 3. RESULT PROCESSING:                                           │
│    ├── Convert database records to job objects                 │
│    ├── Include all necessary metadata                          │
│    ├── Validate job data integrity                             │
│    └── Return array of ready jobs                              │
└─────────────────────────────────────────────────────────────────┘
```

### ⚙️ sqliteQueueProcessor.js - Background Processing Logic

#### 🔄 Main Processing Loop Logic

```javascript
processQueue() LOGIC (Called every 5 seconds):
┌─────────────────────────────────────────────────────────────────┐
│ 1. PRE-FLIGHT CHECKS:                                          │
│    ├── Is processor still running? (this.isProcessing)         │
│    ├── Is WhatsApp client ready and connected?                 │
│    ├── Are we under concurrency limit? (currentlyProcessing)   │
│    └── Exit early if any check fails                           │
│                                                                 │
│ 2. JOB RETRIEVAL:                                               │
│    ├── Calculate available processing slots                    │
│    ├── availableSlots = maxConcurrent - currentlyProcessing    │
│    ├── Get jobs from queue (up to available slots)             │
│    └── If no jobs available, exit gracefully                   │
│                                                                 │
│ 3. CONCURRENT PROCESSING:                                       │
│    ├── Create Promise array for concurrent execution           │
│    ├── For each job: promises.push(processJob(job))            │
│    ├── Execute all jobs in parallel                            │
│    ├── Use Promise.allSettled() to handle mixed results        │
│    └── Don't let one failure stop others                       │
│                                                                 │
│ 4. ERROR HANDLING:                                              │
│    ├── Catch and log any processing errors                     │
│    ├── Continue operation despite individual failures          │
│    ├── Emit events for monitoring                              │
│    └── Schedule next processing cycle                          │
└─────────────────────────────────────────────────────────────────┘
```

#### 📤 Individual Job Processing Logic

```javascript
processJob(job) LOGIC:
┌─────────────────────────────────────────────────────────────────┐
│ 1. JOB PREPARATION:                                             │
│    ├── Add job to currentlyProcessing set                      │
│    ├── Mark job as 'active' in database                        │
│    ├── Update progress to 10%                                  │
│    └── Log processing start                                    │
│                                                                 │
│ 2. CLIENT VALIDATION:                                           │
│    ├── Get WhatsApp client instance                            │
│    ├── Verify client is ready and connected                    │
│    ├── If not ready: throw retryable error                     │
│    └── Update progress to 30%                                  │
│                                                                 │
│ 3. CONTACT VALIDATION:                                          │
│    ├── Call client.getContactById(chatId)                      │
│    ├── Check if contact.isWAContact = true                     │
│    ├── If invalid: throw permanent error (no retry)            │
│    ├── If WhatsApp API error: throw retryable error            │
│    └── Update progress to 60%                                  │
│                                                                 │
│ 4. MESSAGE SENDING:                                             │
│    ├── Call client.sendMessage(chatId, message)                │
│    ├── Wait for WhatsApp API response                          │
│    ├── Capture sent message ID                                 │
│    ├── Update progress to 100%                                 │
│    └── Mark job as completed in database                       │
│                                                                 │
│ 5. ERROR HANDLING:                                              │
│    ├── Catch any errors during processing                      │
│    ├── Classify error as retryable vs permanent                │
│    ├── For retryable: increment attempts + schedule retry      │
│    ├── For permanent: mark as failed permanently               │
│    ├── Apply exponential backoff for retries                   │
│    └── Emit appropriate events for monitoring                  │
│                                                                 │
│ 6. CLEANUP:                                                     │
│    ├── Remove job from currentlyProcessing set                 │
│    ├── Log final status                                        │
│    ├── Emit success/failure events                             │
│    └── Free up slot for next job                               │
└─────────────────────────────────────────────────────────────────┘
```

### 🔄 Retry & Backoff Logic

```javascript
EXPONENTIAL BACKOFF LOGIC:
┌─────────────────────────────────────────────────────────────────┐
│ When job fails with retryable error:                           │
│                                                                 │
│ 1. INCREMENT ATTEMPTS:                                          │
│    ├── attempts = attempts + 1                                 │
│    ├── Check if attempts < maxAttempts (5)                     │
│    ├── If exceeded: mark as permanently failed                 │
│    └── If can retry: calculate delay                           │
│                                                                 │
│ 2. DELAY CALCULATION:                                           │
│    ├── baseDelay = 2000ms (2 seconds)                          │
│    ├── maxDelay = 300000ms (5 minutes)                         │
│    ├── delay = baseDelay * (2 ^ attempts)                      │
│    ├── Apply jitter: ±25% randomization                        │
│    ├── Ensure delay doesn't exceed maxDelay                    │
│    └── Calculate nextRetry = now + delay                       │
│                                                                 │
│ 3. SCHEDULE RETRY:                                              │
│    ├── Set job status back to 'waiting'                        │
│    ├── Set nextRetry timestamp                                 │
│    ├── Store error message for debugging                       │
│    └── Job will be picked up in next processing cycle          │
│                                                                 │
│ RETRY SCHEDULE EXAMPLE:                                         │
│ Attempt 1: Immediate                                            │
│ Attempt 2: 2 seconds later                                     │
│ Attempt 3: 4 seconds later                                     │
│ Attempt 4: 8 seconds later                                     │
│ Attempt 5: 16 seconds later                                    │
│ After 5 attempts: Mark as permanently failed                   │
└─────────────────────────────────────────────────────────────────┘
```

### 🏥 Stalled Job Recovery Logic

```javascript
handleStalledJobs() LOGIC (Called every minute):
┌─────────────────────────────────────────────────────────────────┐
│ PROBLEM: Jobs stuck in 'active' status too long                │
│ CAUSES: Process crash, network issues, infinite loops          │
│                                                                 │
│ DETECTION LOGIC:                                                │
│ 1. FIND STALLED JOBS:                                          │
│    ├── status = 'active'                                       │
│    ├── processedAt < (now - stalledTimeout)                    │
│    ├── Default stalledTimeout = 5 minutes                      │
│    └── These jobs are considered "stuck"                       │
│                                                                 │
│ 2. RECOVERY ACTIONS:                                            │
│    ├── Set stalledAt timestamp                                 │
│    ├── Check if job can still retry                            │
│    ├── If yes: increment attempts + schedule retry             │
│    ├── If no: mark as permanently failed                       │
│    ├── Log stalled job detection                               │
│    └── Emit stalledJobs event for monitoring                   │
│                                                                 │
│ 3. PREVENTION MEASURES:                                         │
│    ├── Set reasonable timeout for each processing step         │
│    ├── Use Promise.race() for timeout control                  │
│    ├── Implement circuit breaker pattern                       │
│    └── Regular health checks during processing                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🔗 How Everything Works Together

### 🎯 Complete Flow Example: Sending a Message

```
1. 📱 Client sends POST /api/whatsapp/send-message
   ├── routes/whatsapp.js receives request
   ├── middleware/auth.js validates JWT token
   └── whatsappController.js processes request

2. 📊 whatsappController.sendMessage():
   ├── Validates and formats phone number
   ├── Creates unique message ID
   ├── Calls messageQueue.addMessage()
   └── Returns 202 Queued response immediately

3. 💾 sqliteMessageQueue.addMessage():
   ├── Creates MessageJob record in SQLite
   ├── Sets status = 'waiting'
   ├── Sets priority and retry settings
   └── Returns job information

4. ⚙️ Background Processing (every 5 seconds):
   ├── sqliteQueueProcessor.processQueue() runs
   ├── Finds jobs with status = 'waiting'
   ├── Calls processJob() for each job
   └── Handles up to 3 jobs concurrently

5. 📤 Individual Job Processing:
   ├── Marks job as 'active'
   ├── Validates WhatsApp contact
   ├── Sends message via WhatsApp client
   ├── Marks job as 'completed' on success
   └── Or schedules retry on failure

6. 🔄 If Error Occurs:
   ├── Classifies error as retryable/permanent
   ├── For retryable: applies exponential backoff
   ├── For permanent: marks as failed
   └── Emits events for monitoring

7. 💓 Keep-Alive (every 30 seconds):
   ├── Checks WhatsApp connection health
   ├── Detects session timeouts
   ├── Triggers auto-recovery if needed
   └── Ensures system stays operational

8. 🏥 Auto-Recovery (when needed):
   ├── Detects connection/session problems
   ├── Safely shuts down current client
   ├── Preserves message queue
   ├── Reinitializes WhatsApp connection
   └── Resumes processing when ready
```

# WhatsApp API - Code Logic Examples

## 💡 Actual Code Examples with Explanations

### 💓 Keep-Alive Mechanism - Real Implementation

```javascript
// File: controllers/whatsappController.js

// MENGAPA KEEP-ALIVE DIPERLUKAN:
// WhatsApp Web session bisa timeout jika tidak ada aktivitas
// Browser bisa menutup koneksi setelah idle
// Untuk mendeteksi masalah koneksi sedini mungkin

let keepAliveInterval = null;
let lastActivity = Date.now();

const startKeepAlive = () => {
  // Jika sudah ada interval, jangan buat yang baru
  if (keepAliveInterval) return;
  
  console.log('💓 Starting keep-alive monitoring...');
  
  // Jalankan setiap 30 detik
  keepAliveInterval = setInterval(async () => {
    try {
      // Cek apakah client masih ada dan ready
      if (!client || !isReady) {
        console.log('⚠️ Keep-alive: Client not ready, skipping ping');
        return;
      }
      
      const now = Date.now();
      const timeSinceActivity = now - lastActivity;
      
      // Jika sudah 5 menit tidak ada aktivitas, lakukan ping
      if (timeSinceActivity > 5 * 60 * 1000) { // 5 menit
        console.log('💓 Keep-alive: Pinging WhatsApp...');
        
        try {
          // Coba ambil info client untuk test koneksi
          const clientInfo = await client.getState();
          console.log('💓 Keep-alive: Ping successful, state:', clientInfo);
          
          // Update last activity
          lastActivity = now;
          
        } catch (pingError) {
          console.log('❌ Keep-alive: Ping failed:', pingError.message);
          
          // Jika ping gagal 3 kali berturut-turut, trigger recovery
          if (pingError.message.includes('Session closed')) {
            console.log('🔄 Keep-alive: Session closed detected, triggering recovery');
            await handleSessionError('keep-alive-ping-failed');
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Keep-alive error:', error.message);
    }
  }, 30000); // 30 detik
};

const stopKeepAlive = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('💓 Keep-alive monitoring stopped');
  }
};

// KAPAN KEEP-ALIVE DIJALANKAN:
// 1. Saat WhatsApp client ready (client.on('ready'))
// 2. Saat auto-recovery berhasil
// 3. Saat manual restart

// KAPAN KEEP-ALIVE DIHENTIKAN:
// 1. Saat client disconnect
// 2. Saat reset session
// 3. Saat shutdown aplikasi
```

### 🏥 Auto-Recovery Logic - Real Implementation

```javascript
// File: controllers/whatsappController.js

const handleSessionError = async (reason) => {
  console.log(`🏥 Auto-recovery triggered: ${reason}`);
  
  // LANGKAH 1: HENTIKAN SEMUA AKTIVITAS
  console.log('🛑 Stopping all activities...');
  
  // Hentikan keep-alive monitoring
  stopKeepAlive();
  
  // Pause queue processor agar tidak ada job baru yang diproses
  if (queueProcessor) {
    await queueProcessor.stop();
    console.log('🛑 Queue processor paused');
  }
  
  // Set status menjadi tidak ready
  isReady = false;
  qrString = '';
  
  // LANGKAH 2: CLEANUP CLIENT
  console.log('🧹 Cleaning up current client...');
  
  if (client) {
    try {
      // Coba destroy client dengan aman
      await client.destroy();
      console.log('✅ Client destroyed successfully');
    } catch (destroyError) {
      console.log('⚠️ Error destroying client:', destroyError.message);
      // Lanjutkan meskipun destroy gagal
    }
    client = null;
  }
  
  // LANGKAH 3: ANALISIS ERROR & STRATEGI RECOVERY
  console.log('🔍 Analyzing error type and recovery strategy...');
  
  let recoveryDelay = 3000; // Default 3 detik
  let shouldClearSession = false;
  
  // Tentukan strategi berdasarkan jenis error
  switch (reason) {
    case 'LOGOUT':
      console.log('📱 Logout detected - will clear session and require new QR');
      shouldClearSession = true;
      recoveryDelay = 5000;
      break;
      
    case 'AUTH_FAILURE':
      console.log('🔐 Auth failure - will clear session and require new QR');
      shouldClearSession = true;
      recoveryDelay = 5000;
      break;
      
    case 'PHONE_DISCONNECTED':
      console.log('📱 Phone disconnected - will try to reconnect with existing session');
      shouldClearSession = false;
      recoveryDelay = 10000; // Wait longer for phone to reconnect
      break;
      
    case 'keep-alive-ping-failed':
      console.log('💓 Keep-alive failed - will try to reconnect');
      shouldClearSession = false;
      recoveryDelay = 5000;
      break;
      
    default:
      console.log('❓ Unknown error - conservative approach');
      shouldClearSession = false;
      recoveryDelay = 8000;
  }
  
  // LANGKAH 4: CLEAR SESSION JIKA DIPERLUKAN
  if (shouldClearSession) {
    console.log('🗑️ Clearing session files...');
    const sessionPath = path.join(__dirname, '..', 'whatsapp-session');
    
    try {
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('✅ Session files cleared');
      }
    } catch (sessionError) {
      console.log('⚠️ Error clearing session:', sessionError.message);
    }
  }
  
  // LANGKAH 5: SCHEDULE RECOVERY
  console.log(`⏰ Scheduling recovery in ${recoveryDelay}ms...`);
  
  setTimeout(async () => {
    try {
      console.log('🔄 Starting auto-recovery...');
      initializationStatus = 'recovering';
      
      // Reinitialize WhatsApp
      await initializeWhatsApp();
      
      console.log('✅ Auto-recovery completed successfully');
      
    } catch (recoveryError) {
      console.error('❌ Auto-recovery failed:', recoveryError.message);
      console.log('🔄 Will retry recovery in 30 seconds...');
      
      // Retry recovery after 30 seconds
      setTimeout(() => {
        handleSessionError('recovery-retry');
      }, 30000);
    }
  }, recoveryDelay);
};

// KAPAN AUTO-RECOVERY DIPANGGIL:
// 1. client.on('disconnected') event
// 2. client.on('auth_failure') event  
// 3. Keep-alive ping failures
// 4. Manual trigger dari admin
```

### 📊 Queue Processing Logic - Real Implementation

```javascript
// File: utils/sqliteQueueProcessor.js

class SQLiteQueueProcessor extends EventEmitter {
  constructor(sqliteQueue, whatsappClient) {
    super();
    this.sqliteQueue = sqliteQueue;
    this.getWhatsAppClient = whatsappClient;
    this.isProcessing = false;
    this.processingInterval = null;
    this.maxConcurrent = 3;
    this.currentlyProcessing = new Set(); // Track jobs being processed
    this.processIntervalMs = 5000; // 5 detik
  }

  // MULAI QUEUE PROCESSING
  start() {
    if (this.processingInterval) {
      console.log('⚠️ Queue processor already running');
      return;
    }
    
    console.log('🚀 Starting queue processor...');
    this.isProcessing = true;
    
    // Proses immediate pertama kali
    this.processQueue();
    
    // Kemudian set interval untuk proses berkala
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.processIntervalMs);
    
    this.emit('started');
  }

  // MAIN PROCESSING LOOP
  async processQueue() {
    // EARLY EXIT CONDITIONS
    if (!this.isProcessing) {
      console.log('🛑 Processor stopped, skipping queue processing');
      return;
    }
    
    const clientInfo = this.getWhatsAppClient();
    if (!clientInfo || !clientInfo.isReady || !clientInfo.client) {
      console.log('📱 WhatsApp not ready, skipping queue processing');
      return;
    }
    
    // CHECK CONCURRENCY LIMIT
    const availableSlots = this.maxConcurrent - this.currentlyProcessing.size;
    if (availableSlots <= 0) {
      console.log('⏳ All processing slots busy, waiting for completion');
      return;
    }
    
    try {
      // GET JOBS READY FOR PROCESSING
      console.log(`🔍 Looking for jobs to process (${availableSlots} slots available)...`);
      
      const readyJobs = await this.sqliteQueue.getJobsForProcessing(availableSlots);
      
      if (readyJobs.length === 0) {
        console.log('📭 No jobs ready for processing');
        return;
      }
      
      console.log(`📊 Found ${readyJobs.length} jobs ready for processing`);
      
      // PROCESS JOBS CONCURRENTLY
      const processingPromises = readyJobs.map(job => {
        return this.processJob(job).catch(error => {
          console.error(`❌ Error processing job ${job.id}:`, error.message);
          // Don't let one job failure stop others
        });
      });
      
      // Wait for all jobs to complete (or fail)
      await Promise.allSettled(processingPromises);
      
    } catch (error) {
      console.error('❌ Error in main queue processing:', error.message);
    }
  }

  // PROCESS INDIVIDUAL JOB
  async processJob(job) {
    const jobId = job.id;
    
    // PREVENT DUPLICATE PROCESSING
    if (this.currentlyProcessing.has(jobId)) {
      console.log(`⚠️ Job ${jobId} already being processed, skipping`);
      return;
    }
    
    // ADD TO PROCESSING SET
    this.currentlyProcessing.add(jobId);
    
    try {
      console.log(`📤 Processing job ${jobId} to ${job.formattedNumber} (attempt ${job.attempts + 1})`);
      
      // STEP 1: MARK AS ACTIVE
      const activeJob = await this.sqliteQueue.markJobAsActive(jobId);
      if (!activeJob) {
        throw new Error('Failed to mark job as active');
      }
      
      await this.sqliteQueue.updateJobProgress(jobId, 10);
      
      // STEP 2: GET WHATSAPP CLIENT
      const clientInfo = this.getWhatsAppClient();
      if (!clientInfo || !clientInfo.isReady || !clientInfo.client) {
        throw new Error('WhatsApp client not ready');
      }
      
      const client = clientInfo.client;
      await this.sqliteQueue.updateJobProgress(jobId, 30);
      
      // STEP 3: VALIDATE CONTACT
      console.log(`🔍 Validating contact ${job.chatId}...`);
      
      try {
        const contact = await client.getContactById(job.chatId);
        
        if (!contact.isWAContact) {
          // PERMANENT ERROR - number not on WhatsApp
          const error = new Error('Number not registered on WhatsApp');
          error.permanent = true;
          throw error;
        }
        
        console.log(`✅ Contact validation successful for ${job.formattedNumber}`);
        
      } catch (contactError) {
        if (contactError.message.includes('not registered') || 
            contactError.message.includes('invalid')) {
          // PERMANENT ERROR
          const error = new Error('Number not registered on WhatsApp');
          error.permanent = true;
          throw error;
        }
        // RETRYABLE ERROR
        throw contactError;
      }
      
      await this.sqliteQueue.updateJobProgress(jobId, 60);
      
      // STEP 4: SEND MESSAGE
      console.log(`📤 Sending message to ${job.chatId}...`);
      
      const sentMessage = await client.sendMessage(job.chatId, job.message);
      
      await this.sqliteQueue.updateJobProgress(jobId, 100);
      
      // STEP 5: MARK AS COMPLETED
      const result = {
        success: true,
        messageId: job.messageId,
        sentMessageId: sentMessage.id._serialized,
        to: job.formattedNumber,
        timestamp: Date.now()
      };
      
      await this.sqliteQueue.markJobAsCompleted(jobId, result);
      
      console.log(`✅ Job ${jobId} completed successfully`);
      
      // EMIT SUCCESS EVENT
      this.emit('messageSuccess', {
        messageId: job.messageId,
        jobId: jobId,
        to: job.formattedNumber,
        result: result
      });
      
    } catch (error) {
      console.log(`❌ Job ${jobId} failed: ${error.message}`);
      
      // ERROR CLASSIFICATION
      if (error.permanent || !this.isRetryableError(error)) {
        // PERMANENT FAILURE
        await this.sqliteQueue.markJobAsFailed(jobId, error.message);
        
        this.emit('messageFailed', {
          messageId: job.messageId,
          jobId: jobId,
          to: job.formattedNumber,
          error: error.message,
          attempts: job.attempts + 1,
          permanent: true
        });
      } else {
        // RETRYABLE ERROR
        await this.sqliteQueue.markJobAsFailed(jobId, error.message);
        
        this.emit('messageRetry', {
          messageId: job.messageId,
          jobId: jobId,
          to: job.formattedNumber,
          error: error.message,
          attempts: job.attempts + 1
        });
      }
      
    } finally {
      // CLEANUP - ALWAYS EXECUTED
      this.currentlyProcessing.delete(jobId);
      console.log(`🔧 Job ${jobId} cleanup completed`);
    }
  }
}
```

### 🔄 Retry Logic with Exponential Backoff - Real Implementation

```javascript
// File: models/MessageJob.js

// INSTANCE METHOD untuk increment attempts dengan backoff
MessageJob.prototype.incrementAttempts = async function(error = null) {
  console.log(`🔄 Incrementing attempts for job ${this.id} (current: ${this.attempts})`);
  
  // INCREMENT ATTEMPT COUNTER
  this.attempts += 1;
  this.lastError = error;
  
  // CHECK IF MAX ATTEMPTS REACHED
  if (this.attempts >= this.maxAttempts) {
    console.log(`❌ Job ${this.id} reached max attempts (${this.maxAttempts}), marking as failed`);
    await this.markAsFailed(error);
    return;
  }
  
  // CALCULATE EXPONENTIAL BACKOFF DELAY
  console.log(`⏰ Calculating backoff delay for attempt ${this.attempts}...`);
  
  const baseDelay = 2000; // 2 detik base
  const maxDelay = 300000; // 5 menit maximum
  
  // Exponential: 2^(attempts-1) * baseDelay
  const exponentialDelay = baseDelay * Math.pow(2, this.attempts - 1);
  
  // Apply maximum limit
  const limitedDelay = Math.min(exponentialDelay, maxDelay);
  
  // ADD JITTER (±25% randomization to prevent thundering herd)
  const jitterRange = limitedDelay * 0.25;
  const jitter = (Math.random() * 2 - 1) * jitterRange; // -25% to +25%
  const finalDelay = Math.max(1000, limitedDelay + jitter); // Minimum 1 second
  
  console.log(`⏰ Backoff calculation:
    - Base delay: ${baseDelay}ms
    - Exponential: ${exponentialDelay}ms  
    - Limited: ${limitedDelay}ms
    - Jitter: ${jitter.toFixed(0)}ms
    - Final delay: ${finalDelay.toFixed(0)}ms`);
  
  // SET NEXT RETRY TIME
  this.nextRetry = new Date(Date.now() + finalDelay);
  this.status = 'waiting';
  
  await this.save();
  
  console.log(`⏰ Job ${this.id} scheduled for retry at ${this.nextRetry.toISOString()}`);
};

// RETRY SCHEDULE EXAMPLES:
// Attempt 1: Immediate (0ms)
// Attempt 2: ~2 seconds (2000ms ± 500ms jitter)  
// Attempt 3: ~4 seconds (4000ms ± 1000ms jitter)
// Attempt 4: ~8 seconds (8000ms ± 2000ms jitter)
// Attempt 5: ~16 seconds (16000ms ± 4000ms jitter)
// After 5 attempts: Permanently failed
```

### 🎯 Real-World Example: Complete Message Journey

```javascript
// SCENARIO: User mengirim pesan ke nomor yang sedang offline

console.log('📱 USER REQUEST: Send message to 6281234567890');

// 1. CONTROLLER RECEIVES REQUEST
const sendMessage = async (req, res) => {
  const { number: '081234567890', message: 'Hello World' } = req.body;
  
  // Format nomor: 081234567890 → 6281234567890@c.us
  const formattedNumber = '6281234567890';
  const chatId = '6281234567890@c.us';
  
  console.log('📝 Adding message to queue...');
  
  // 2. ADD TO QUEUE
  const queueResult = await messageQueue.addMessage({
    chatId,
    message: 'Hello World',
    formattedNumber,
    originalNumber: '081234567890',
    priority: 'NORMAL'
  });
  
  console.log('✅ Message queued with job ID:', queueResult.jobId);
  
  // 3. RETURN IMMEDIATE RESPONSE
  res.status(202).json({
    success: true,
    message: 'Message queued for delivery',
    messageId: queueResult.messageId,
    jobId: queueResult.jobId
  });
};

// 4. BACKGROUND PROCESSING (5 detik kemudian)
console.log('⚙️ QUEUE PROCESSOR: Checking for jobs...');

const readyJobs = await sqliteQueue.getJobsForProcessing(3);
console.log('📋 Found 1 job ready for processing');

// 5. PROCESS THE JOB
console.log('📤 Processing job to 6281234567890 (attempt 1)');

try {
  // 6. VALIDATE CONTACT
  const contact = await client.getContactById('6281234567890@c.us');
  console.log('✅ Contact validation successful');
  
  // 7. SEND MESSAGE
  console.log('📤 Sending message...');
  const sentMessage = await client.sendMessage('6281234567890@c.us', 'Hello World');
  
  // 8. BUT... NETWORK ERROR OCCURS!
  throw new Error('Network timeout');
  
} catch (error) {
  console.log('❌ Job failed: Network timeout');
  
  // 9. ERROR IS RETRYABLE
  const isRetryable = this.isRetryableError(error); // true
  console.log('🔄 Error is retryable, scheduling retry...');
  
  // 10. APPLY EXPONENTIAL BACKOFF
  // First retry: ~2 seconds later
  await job.incrementAttempts('Network timeout');
  console.log('⏰ Job scheduled for retry in 2 seconds');
}

// 11. RETRY ATTEMPT (2 detik kemudian)
console.log('🔄 RETRY: Processing job to 6281234567890 (attempt 2)');

try {
  // This time it succeeds
  const sentMessage = await client.sendMessage('6281234567890@c.us', 'Hello World');
  console.log('✅ Message sent successfully!');
  
  // 12. MARK AS COMPLETED
  await sqliteQueue.markJobAsCompleted(jobId, {
    success: true,
    sentMessageId: sentMessage.id._serialized,
    timestamp: Date.now()
  });
  
} catch (retryError) {
  // If it fails again, it will be retried with 4 second delay, then 8, 16, etc.
  console.log('❌ Retry failed, will try again in 4 seconds...');
}
```

Ini adalah penjelasan detail tentang **logika internal** setiap komponen sistem! 🚀