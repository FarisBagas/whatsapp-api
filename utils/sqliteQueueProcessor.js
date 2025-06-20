const EventEmitter = require('events');

class SQLiteQueueProcessor extends EventEmitter {
  constructor(sqliteQueue, whatsappClient) {
    super();
    this.sqliteQueue = sqliteQueue;
    this.getWhatsAppClient = whatsappClient; // Function to get current client
    this.isProcessing = false;
    this.processingInterval = null;
    this.stalledCheckInterval = null;
    this.processIntervalMs = 5000; // Process every 5 seconds
    this.stalledTimeoutMs = 300000; // 5 minutes stalled timeout
    this.maxConcurrent = 3; // Max concurrent message sends
    this.currentlyProcessing = new Set();
    
    console.log('🚀 SQLite queue processor initialized');
  }

  // Start queue processing
  start() {
    if (this.processingInterval) return;
    
    console.log('🚀 Starting SQLite queue processor...');
    this.isProcessing = true;
    
    // Process immediately, then on interval
    this.processQueue();
    
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.processIntervalMs);
    
    // Check for stalled jobs every minute
    this.stalledCheckInterval = setInterval(() => {
      this.handleStalledJobs();
    }, 60000);
    
    this.emit('started');
  }

  // Stop queue processing
  async stop() {
    console.log('🛑 Stopping SQLite queue processor...');
    this.isProcessing = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    if (this.stalledCheckInterval) {
      clearInterval(this.stalledCheckInterval);
      this.stalledCheckInterval = null;
    }
    
    // Wait for current jobs to finish
    while (this.currentlyProcessing.size > 0) {
      console.log(`⏳ Waiting for ${this.currentlyProcessing.size} jobs to finish...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    this.emit('stopped');
  }

  // Resume processing
  async resume() {
    if (!this.isProcessing) {
      this.start();
      this.emit('resumed');
    }
  }
  // Main queue processing logic
  async processQueue() {
    if (!this.isProcessing) return;
    
    const clientInfo = this.getWhatsAppClient();
    if (!clientInfo || !clientInfo.isReady || !clientInfo.client) {
      return; // Skip if WhatsApp not ready
    }

    try {
      // Get available slots for processing
      const availableSlots = this.maxConcurrent - this.currentlyProcessing.size;
      if (availableSlots <= 0) return;

      // Get jobs ready for processing
      const readyJobs = await this.sqliteQueue.getJobsForProcessing(availableSlots);
      if (readyJobs.length === 0) return;

      console.log(`📊 Processing ${readyJobs.length} messages from SQLite queue`);

      // Process jobs concurrently
      const processingPromises = readyJobs.map(job => this.processJob(job));
      await Promise.allSettled(processingPromises);

    } catch (error) {
      console.error('❌ Error in queue processing:', error.message);
    }
  }
  // Process individual job
  async processJob(job) {
    const jobId = job.id;
    
    if (this.currentlyProcessing.has(jobId)) return;
    this.currentlyProcessing.add(jobId);
    
    try {
      console.log(`📤 Processing job ${jobId} to ${job.formattedNumber} (attempt ${job.attempts + 1})`);
      
      // Mark job as active
      const activeJob = await this.sqliteQueue.markJobAsActive(jobId);
      if (!activeJob) {
        console.log(`⚠️ Job ${jobId} could not be marked as active`);
        return;
      }

      await this.sqliteQueue.updateJobProgress(jobId, 10);      const clientInfo = this.getWhatsAppClient();
      if (!clientInfo || !clientInfo.isReady || !clientInfo.client) {
        throw new Error('WhatsApp client not ready');
      }

      const client = clientInfo.client;
      
      // Debug client methods
      console.log(`🔍 Client available methods: ${Object.getOwnPropertyNames(client).filter(name => typeof client[name] === 'function').join(', ')}`);

      await this.sqliteQueue.updateJobProgress(jobId, 30);

      // Validate contact before sending
      try {
        console.log(`🔍 Validating contact for ${job.chatId}`);
        const contact = await client.getContactById(job.chatId);
        
        if (!contact.isWAContact) {
          // Permanent failure - don't retry
          const error = new Error('Number not registered on WhatsApp');
          error.permanent = true;
          throw error;
        }
        
        console.log(`✅ Contact validation successful for ${job.formattedNumber}`);
      } catch (contactError) {
        console.log(`❌ Contact validation failed: ${contactError.message}`);
        
        if (contactError.message.includes('not registered') || 
            contactError.message.includes('invalid') ||
            contactError.message.includes('not a valid wid')) {
          // Permanent failure
          const error = new Error('Number not registered on WhatsApp');
          error.permanent = true;
          throw error;
        }
        throw contactError; // Re-throw for retry
      }

      await this.sqliteQueue.updateJobProgress(jobId, 60);

      // Send message
      console.log(`📤 Sending message to ${job.chatId}: ${job.message.substring(0, 50)}...`);
      const sentMessage = await client.sendMessage(job.chatId, job.message);
      
      await this.sqliteQueue.updateJobProgress(jobId, 100);

      // Mark job as completed
      const result = {
        success: true,
        messageId: job.messageId,
        sentMessageId: sentMessage.id._serialized,
        to: job.formattedNumber,
        timestamp: Date.now()
      };

      await this.sqliteQueue.markJobAsCompleted(jobId, result);
      
      console.log(`✅ Job ${jobId} completed successfully`);
      this.emit('messageSuccess', {
        messageId: job.messageId,
        jobId: jobId,
        to: job.formattedNumber,
        result: result
      });

    } catch (error) {
      console.log(`❌ Job ${jobId} failed: ${error.message}`);
      
      // Determine if error should be retried
      if (error.permanent || !this.isRetryableError(error)) {
        // Permanent failure
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
        // Retryable error - increment attempts
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
      this.currentlyProcessing.delete(jobId);
    }
  }

  // Handle stalled jobs
  async handleStalledJobs() {
    try {
      const stalledCount = await this.sqliteQueue.handleStalledJobs(this.stalledTimeoutMs);
      if (stalledCount > 0) {
        console.log(`⚠️ Handled ${stalledCount} stalled jobs`);
        this.emit('stalledJobs', { count: stalledCount });
      }
    } catch (error) {
      console.error('❌ Error handling stalled jobs:', error.message);
    }
  }
  // Determine if error is retryable
  isRetryableError(error) {
    const retryableErrors = [
      'Session closed',
      'Protocol error',
      'Target closed', 
      'Navigation timeout',
      'net::ERR_',
      'WhatsApp client not ready',
      'Connection failed',
      'Timeout',
      'Network error',
      'disconnected',
      'ETIMEDOUT',
      'ECONNRESET',
      'evaluation failed',
      'client.getContactById is not a function'
    ];

    const nonRetryableErrors = [
      'not registered',
      'Invalid number',
      'Blocked',
      'Rate limited permanently',
      'invalid wid',
      'not a valid wid'
    ];

    const errorMsg = error.message.toLowerCase();

    // Check non-retryable first
    for (const nonRetryable of nonRetryableErrors) {
      if (errorMsg.includes(nonRetryable.toLowerCase())) {
        return false;
      }
    }

    // Check retryable
    for (const retryable of retryableErrors) {
      if (errorMsg.includes(retryable.toLowerCase())) {
        return true;
      }
    }

    // Log unknown errors for debugging
    console.log(`🔍 Unknown error type: ${error.message} - defaulting to retryable`);

    // Default to retryable for unknown errors
    return true;
  }

  // Get processor statistics
  async getStats() {
    const queueStats = await this.sqliteQueue.getStats();
    
    return {
      isProcessing: this.isProcessing,
      currentlyProcessing: this.currentlyProcessing.size,
      maxConcurrent: this.maxConcurrent,
      processInterval: this.processIntervalMs,
      stalledTimeout: this.stalledTimeoutMs,
      queueStats: queueStats
    };
  }

  // Update configuration
  updateConfig(config) {
    let updated = false;
    
    if (config.processInterval && config.processInterval >= 2000) {
      this.processIntervalMs = config.processInterval;
      if (this.processingInterval) {
        this.stop();
        this.start();
      }
      updated = true;
    }
    
    if (config.maxConcurrent && config.maxConcurrent >= 1 && config.maxConcurrent <= 10) {
      this.maxConcurrent = config.maxConcurrent;
      updated = true;
    }
    
    if (config.stalledTimeout && config.stalledTimeout >= 60000) {
      this.stalledTimeoutMs = config.stalledTimeout;
      updated = true;
    }
    
    if (updated) {
      console.log('🔧 SQLite queue processor config updated:', config);
      this.emit('configUpdated', config);
    }
    
    return updated;
  }

  // Manual trigger for processing
  async processQueueManually() {
    console.log('📊 Manual queue processing triggered');
    await this.processQueue();
    return await this.getStats();
  }
}

module.exports = SQLiteQueueProcessor;